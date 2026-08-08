package tools

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// SemanticSearchParams is the input to semantic_search.
type SemanticSearchParams struct {
	// Query is the free-text query.
	Query string `json:"query"`
	// DeckID optionally scopes the search to a single deck. Empty = global.
	DeckID string `json:"deck_id,omitempty"`
	// K is the number of top results to return. Defaults to 5, max 50.
	K int `json:"k,omitempty"`
	// SlidesJSON is the corpus. Each entry has "id", "title", "content".
	// Optional in M1 — if absent, the tool returns an empty result set
	// (rather than failing) so the wire format is testable without a DB.
	SlidesJSON json.RawMessage `json:"slides,omitempty"`
}

// SemanticSearchHit is one search result.
type SemanticSearchHit struct {
	SlideID  string  `json:"slide_id"`
	Title    string  `json:"title,omitempty"`
	Score    float64 `json:"score"`
	Snippet  string  `json:"snippet,omitempty"`
}

// SemanticSearch returns the top-K slides matching a query string,
// scored by trigram similarity over slide content. In M1 this uses
// a simple Jaccard-style token overlap as the score, since the
// pg_trgm index lives behind the DB and M1 is wire-format only.
func SemanticSearch(params json.RawMessage) (map[string]any, error) {
	var p SemanticSearchParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, fmt.Errorf("semantic_search: invalid params: %w", err)
	}
	if strings.TrimSpace(p.Query) == "" {
		return nil, fmt.Errorf("semantic_search: query is required")
	}
	if p.K <= 0 {
		p.K = 5
	}
	if p.K > 50 {
		p.K = 50
	}

	if len(p.SlidesJSON) == 0 {
		return ok(map[string]any{
			"query":    p.Query,
			"deck_id":  p.DeckID,
			"hits":     []SemanticSearchHit{},
			"scanned":  0,
		}), nil
	}

	var slides []struct {
		ID      string `json:"id"`
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if err := json.Unmarshal(p.SlidesJSON, &slides); err != nil {
		return nil, fmt.Errorf("semantic_search: invalid slides: %w", err)
	}

	queryTokens := tokenize(p.Query)
	if len(queryTokens) == 0 {
		return ok(map[string]any{
			"query":   p.Query,
			"deck_id": p.DeckID,
			"hits":    []SemanticSearchHit{},
			"scanned": len(slides),
		}), nil
	}

	hits := make([]SemanticSearchHit, 0, len(slides))
	for _, s := range slides {
		corpus := s.Title + " " + s.Content
		corpusTokens := tokenize(corpus)
		score := jaccard(queryTokens, corpusTokens)
		if score <= 0 {
			continue
		}
		snippet := bestSnippet(corpus, queryTokens)
		hits = append(hits, SemanticSearchHit{
			SlideID: s.ID,
			Title:   s.Title,
			Score:   score,
			Snippet: snippet,
		})
	}

	sort.Slice(hits, func(i, j int) bool {
		if hits[i].Score != hits[j].Score {
			return hits[i].Score > hits[j].Score
		}
		return hits[i].SlideID < hits[j].SlideID
	})

	if len(hits) > p.K {
		hits = hits[:p.K]
	}

	return ok(map[string]any{
		"query":   p.Query,
		"deck_id": p.DeckID,
		"hits":    hits,
		"scanned": len(slides),
	}), nil
}

// tokenize lower-cases and splits on whitespace + punctuation.
func tokenize(s string) map[string]struct{} {
	out := make(map[string]struct{})
	word := strings.Builder{}
	for _, r := range strings.ToLower(s) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			word.WriteRune(r)
		default:
			if word.Len() > 0 {
				out[word.String()] = struct{}{}
				word.Reset()
			}
		}
	}
	if word.Len() > 0 {
		out[word.String()] = struct{}{}
	}
	return out
}

// jaccard returns |a ∩ b| / |a ∪ b| over token sets.
func jaccard(a, b map[string]struct{}) float64 {
	if len(a) == 0 || len(b) == 0 {
		return 0
	}
	intersect := 0
	for k := range a {
		if _, ok := b[k]; ok {
			intersect++
		}
	}
	union := len(a) + len(b) - intersect
	if union == 0 {
		return 0
	}
	return float64(intersect) / float64(union)
}

// bestSnippet returns a 120-char window around the first query token
// match in corpus, or the first 120 chars if none match.
func bestSnippet(corpus string, queryTokens map[string]struct{}) string {
	lower := strings.ToLower(corpus)
	for tok := range queryTokens {
		idx := strings.Index(lower, tok)
		if idx < 0 {
			continue
		}
		start := idx - 40
		if start < 0 {
			start = 0
		}
		end := start + 120
		if end > len(corpus) {
			end = len(corpus)
		}
		if start > 0 {
			return "…" + corpus[start:end] + "…"
		}
		return corpus[start:end] + "…"
	}
	if len(corpus) <= 120 {
		return corpus
	}
	return corpus[:120] + "…"
}