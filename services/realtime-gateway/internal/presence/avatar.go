package presence

import (
	"fmt"
	"sync"
)

// AvatarInfo holds avatar metadata for a participant in a deck.
type AvatarInfo struct {
	ActorID string
	Name    string
	Color   string
}

// AvatarRegistry tracks the list of avatars per deck.
type AvatarRegistry struct {
	mu      sync.RWMutex
	decks   map[string]map[string]*AvatarInfo // deckID → actorID → info
}

// NewAvatarRegistry creates a new avatar registry.
func NewAvatarRegistry() *AvatarRegistry {
	return &AvatarRegistry{
		decks: make(map[string]map[string]*AvatarInfo),
	}
}

// Join registers an avatar for a deck.
func (r *AvatarRegistry) Join(deckID, actorID, name, color string) *AvatarInfo {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.decks[deckID] == nil {
		r.decks[deckID] = make(map[string]*AvatarInfo)
	}
	info := &AvatarInfo{ActorID: actorID, Name: name, Color: color}
	r.decks[deckID][actorID] = info
	return info
}

// Leave removes an avatar from a deck.
func (r *AvatarRegistry) Leave(deckID, actorID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if deck, ok := r.decks[deckID]; ok {
		delete(deck, actorID)
		if len(deck) == 0 {
			delete(r.decks, deckID)
		}
	}
}

// List returns all avatars currently in a deck.
func (r *AvatarRegistry) List(deckID string) []*AvatarInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()

	deck, ok := r.decks[deckID]
	if !ok {
		return nil
	}
	out := make([]*AvatarInfo, 0, len(deck))
	for _, info := range deck {
		out = append(out, info)
	}
	return out
}

// Count returns the number of avatars in a deck.
func (r *AvatarRegistry) Count(deckID string) int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.decks[deckID])
}

// DefaultColors provides a palette of avatar colors.
var DefaultColors = []string{
	"#E57373", "#F06292", "#BA68C8", "#9575CD",
	"#7986CB", "#64B5F6", "#4FC3F7", "#4DD0E1",
	"#4DB6AC", "#81C784", "#AED581", "#FFD54F",
}

// PickColor returns a deterministic color for an actorID.
func PickColor(actorID string) string {
	h := 0
	for _, c := range actorID {
		h = (h*31 + int(c)) % len(DefaultColors)
	}
	return DefaultColors[h]
}

// String returns a human-readable description.
func (a *AvatarInfo) String() string {
	return fmt.Sprintf("%s (%s)", a.Name, a.ActorID)
}
