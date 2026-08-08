// Tests for the Phase 17 W0 fan-out helpers in conn.go. These cover
// the canonical-kind mapping (audienceLiveEventKind) so unrecognized
// envelope types fall through silently instead of producing a kind the
// columnar loader rejects.
package transport

import "testing"

func TestAudienceLiveEventKind(t *testing.T) {
	cases := []struct {
		env  string
		want string
	}{
		{"poll_vote", "poll_vote"},
		{"poll_open", "poll_open"},
		{"poll_close", "poll_close"},
		{"qa_item", "qa_submit"},
		{"qa_upvote", "qa_upvote"},
		{"quiz_attempt", "quiz_attempt"},
		{"quiz_open", "quiz_open"},
		{"quiz_close", "quiz_close"},
		{"reaction", "reaction_burst"},
		{"nav_vote", "nav_vote_cast"},
		{"sentiment_input", "sentiment_sample"},
		{"raise_hand", "raise_hand"},
		{"feedback_response", "feedback_response"},
		{"heartbeat", ""},   // never fanned out
		{"hello", ""},       // handled separately
		{"leave", ""},       // handled separately
		{"unknown_thing", ""},
		{"", ""},
	}
	for _, tc := range cases {
		got := audienceLiveEventKind(tc.env)
		if got != tc.want {
			t.Errorf("audienceLiveEventKind(%q) = %q, want %q", tc.env, got, tc.want)
		}
	}
}