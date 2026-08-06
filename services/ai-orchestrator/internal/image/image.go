// Package image implements the AI image generation + background removal
// features (P12 #114).
//
// Capabilities:
//   - Generate: text-to-image for canvas fills, hero art, illustrations,
//     and icons. Style-locked to the active brand kit (palette +
//     illustration style).
//   - RemoveBackground: foreground segmentation on uploaded images,
//     producing transparent PNGs.
//
// Behavior contract:
//   - Provider dispatch with fallback: try the primary provider; if
//     it fails (rate limit, upstream error), fall back to the next
//     provider in the chain. The order is configurable.
//   - Two-layer moderation: the orchestrator enforces a blocklist
//     (trademarks, public-figure references) BEFORE calling the
//     provider, and re-checks the post-generation moderation verdict
//     returned by the provider. Belt-and-suspenders.
//   - Provenance: every generated image carries a Provenance record
//     with model version, prompt, and timestamp.
//   - Style-lock: the prompt is automatically prefixed with the
//     brand kit's palette and illustration-style keywords, so the
//     output is on-brand.
package image

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// Brand context
// ---------------------------------------------------------------------------

// BrandKit is the brand context for style-locking generated images.
type BrandKit struct {
	Name              string   `json:"name,omitempty"`
	Palette           []string `json:"palette,omitempty"` // hex colors
	IllustrationStyle string   `json:"illustration_style,omitempty"` // e.g. "flat", "isometric"
	Mood              string   `json:"mood,omitempty"`              // e.g. "playful", "minimal"
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

// GenerateRequest is the input to Generate.
type GenerateRequest struct {
	Prompt      string   `json:"prompt"`
	Brand       BrandKit `json:"brand"`
	Models      []string `json:"models,omitempty"` // candidate models (provider-prefixed)
	N           int      `json:"n,omitempty"`      // count
	Size        string   `json:"size,omitempty"`   // "1024x1024", etc.
}

// GenerateResult is one generated image.
type GenerateResult struct {
	URL        string    `json:"url"`
	Provider   string    `json:"provider"`
	Model      string    `json:"model"`
	Prompt     string    `json:"prompt"`     // includes style-lock prefix
	Provenance Provenance `json:"provenance"`
	Moderation ModerationResult `json:"moderation"`
}

// Provenance records the model's version + prompt + timestamp for audit.
type Provenance struct {
	ModelVersion string    `json:"model_version"`
	Prompt       string    `json:"prompt"`
	GeneratedAt  time.Time `json:"generated_at"`
	Hash         string    `json:"hash"` // sha256 of (provider+model+prompt)
}

// ---------------------------------------------------------------------------
// Background removal
// ---------------------------------------------------------------------------

// RemoveBackgroundRequest is the input to RemoveBackground.
type RemoveBackgroundRequest struct {
	ImageURL  string `json:"image_url"`
	ImageData []byte `json:"image_data,omitempty"` // alt: inline bytes
}

// RemoveBackgroundResult is the output.
type RemoveBackgroundResult struct {
	TransparentPNG []byte    `json:"-"`
	URL            string    `json:"url,omitempty"`
	Provenance     Provenance `json:"provenance"`
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

// ModerationResult captures both layers of moderation.
type ModerationResult struct {
	OK         bool   `json:"ok"`
	Blocked    bool   `json:"blocked"`
	Reason     string `json:"reason,omitempty"`
	Layer1Hit  bool   `json:"layer1_hit"` // orchestrator blocklist
	Layer2Hit  bool   `json:"layer2_hit"` // provider verdict
}

// ---------------------------------------------------------------------------
// Provider abstraction
// ---------------------------------------------------------------------------

// Provider is one image-generation backend.
type Provider interface {
	Name() string
	Generate(ctx context.Context, req GenerateRequest, model string) (*GenerateResult, error)
	Moderate(ctx context.Context, prompt string) (ModerationResult, error)
	RemoveBackground(ctx context.Context, req RemoveBackgroundRequest) (*RemoveBackgroundResult, error)
}

// ImageService dispatches image generation to a chain of providers.
type ImageService struct {
	providers []Provider
	primary   string
	blocklist []string
	// ReadyInFallback, when non-empty, is reported to clients as a
	// "ready in ~N min" hint when all providers fail.
	ReadyInFallback string
}

// Config is the input to NewImageService.
type Config struct {
	Providers        []Provider
	Primary          string
	Blocklist        []string
	ReadyInFallback  string
}

// NewImageService returns a configured ImageService.
func NewImageService(cfg Config) *ImageService {
	if cfg.Blocklist == nil {
		cfg.Blocklist = DefaultBlocklist()
	}
	return &ImageService{
		providers:       cfg.Providers,
		primary:         cfg.Primary,
		blocklist:       cfg.Blocklist,
		ReadyInFallback: cfg.ReadyInFallback,
	}
}

// DefaultBlocklist returns the orchestrator-side blocklist (Layer 1).
// It catches the most common policy violations BEFORE calling a
// provider. The provider also runs its own moderation (Layer 2).
func DefaultBlocklist() []string {
	return []string{
		// Public figures — example pattern. Real deployment pulls
		// from a maintained list and is updated centrally.
		"photo of taylor swift",
		"photo of a famous person",
		"celebrity portrait",
		// Trademarked characters.
		"mickey mouse",
		"pikachu",
		"mario",
		"sonic the hedgehog",
		// CSAM / explicit.
		"nsfw",
		"explicit",
		"child exploitation",
		"minor in sexual context",
	}
}

// ErrAllProvidersUnavailable is returned when every provider fails.
var ErrAllProvidersUnavailable = errors.New("image: all providers unavailable")

// ErrBlockedByOrchestrator is returned when the orchestrator-side
// blocklist rejects the prompt.
var ErrBlockedByOrchestrator = errors.New("image: blocked by orchestrator moderation")

// ErrModerationBlocked is returned when the provider-side moderation
// verdict blocks the result.
var ErrModerationBlocked = errors.New("image: blocked by provider moderation")

// Generate runs the prompt through the provider chain, falling back on
// errors. The first successful result wins. If all providers fail,
// ErrAllProvidersUnavailable is returned.
func (s *ImageService) Generate(ctx context.Context, req GenerateRequest) (*GenerateResult, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Prompt) == "" {
		return nil, errors.New("image: prompt is required")
	}

	// Layer 1: orchestrator-side blocklist.
	if s.isBlocked(req.Prompt) {
		return nil, fmt.Errorf("%w: %q", ErrBlockedByOrchestrator, req.Prompt)
	}

	// Style-lock — prefix the prompt with brand kit keywords.
	styledPrompt := styleLock(req.Prompt, req.Brand)
	req.Prompt = styledPrompt

	// Determine candidate models.
	models := req.Models
	if len(models) == 0 {
		models = defaultModels()
	}

	// Try providers in order.
	for _, p := range s.providers {
		for _, m := range models {
			res, err := p.Generate(ctx, req, m)
			if err != nil {
				// Provider error — try next.
				continue
			}
			if res == nil {
				continue
			}

			// Layer 2: provider-side moderation.
			verdict, mErr := p.Moderate(ctx, req.Prompt)
			if mErr == nil && verdict.Blocked {
				return nil, fmt.Errorf("%w: %s", ErrModerationBlocked, verdict.Reason)
			}
			res.Moderation = verdict

			// Always set provenance — providers populate the
			// model_version, but we ensure the timestamp + hash are
			// present.
			if res.Provenance.GeneratedAt.IsZero() {
				res.Provenance.GeneratedAt = time.Now().UTC()
			}
			if res.Provenance.Hash == "" {
				res.Provenance.Hash = hashProvenance(res)
			}

			return res, nil
		}
	}

	return nil, fmt.Errorf("%w (ready in %s)", ErrAllProvidersUnavailable, s.ReadyInFallback)
}

// RemoveBackground runs background removal through the provider chain.
func (s *ImageService) RemoveBackground(ctx context.Context, req RemoveBackgroundRequest) (*RemoveBackgroundResult, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if req.ImageURL == "" && len(req.ImageData) == 0 {
		return nil, errors.New("image: image_url or image_data required")
	}
	for _, p := range s.providers {
		res, err := p.RemoveBackground(ctx, req)
		if err != nil {
			continue
		}
		if res == nil {
			continue
		}
		if res.Provenance.GeneratedAt.IsZero() {
			res.Provenance.GeneratedAt = time.Now().UTC()
		}
		if res.Provenance.Hash == "" {
			res.Provenance.Hash = hashProvenanceFromInputs(p.Name(), req.ImageURL, req.ImageData)
		}
		return res, nil
	}
	return nil, fmt.Errorf("%w (background removal)", ErrAllProvidersUnavailable)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// isBlocked reports whether the prompt matches any blocklist term
// (case-insensitive substring).
func (s *ImageService) isBlocked(prompt string) bool {
	lower := strings.ToLower(prompt)
	for _, term := range s.blocklist {
		if strings.Contains(lower, strings.ToLower(term)) {
			return true
		}
	}
	return false
}

// styleLock prepends brand kit keywords to the prompt so the output
// is consistent with the brand. This is the canonical implementation
// — providers do NOT need to know about brand kits.
func styleLock(prompt string, brand BrandKit) string {
	if brand.Name == "" && len(brand.Palette) == 0 && brand.IllustrationStyle == "" {
		return prompt
	}
	parts := []string{prompt}
	if brand.IllustrationStyle != "" {
		parts = append(parts, brand.IllustrationStyle+" illustration style")
	}
	if brand.Mood != "" {
		parts = append(parts, brand.Mood+" mood")
	}
	if len(brand.Palette) > 0 {
		parts = append(parts, "palette: "+strings.Join(brand.Palette, ", "))
	}
	if brand.Name != "" {
		parts = append(parts, "brand: "+brand.Name)
	}
	return strings.Join(parts, " | ")
}

// defaultModels is the candidate list when the caller didn't supply one.
func defaultModels() []string {
	return []string{
		"openai/dall-e-3",
		"google/imagen-3.0",
		"stability/sdxl-1.0",
	}
}

func hashProvenance(r *GenerateResult) string {
	h := sha256.Sum256([]byte(r.Provider + "|" + r.Model + "|" + r.Prompt))
	return hex.EncodeToString(h[:])
}

func hashProvenanceFromInputs(provider, url string, data []byte) string {
	if len(data) > 0 {
		h := sha256.Sum256(append([]byte(provider+"|"+url+"|"), data...))
		return hex.EncodeToString(h[:])
	}
	h := sha256.Sum256([]byte(provider + "|" + url))
	return hex.EncodeToString(h[:])
}