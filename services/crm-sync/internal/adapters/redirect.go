// Common test helpers for the adapter packages.
package adapters

import (
	"net/http"
	"net/url"
	"strings"
)

// redirectTransport rewrites every request to point at baseURL so a
// hardcoded "https://api.hubapi.com/…" endpoint can be exercised
// against an httptest server. The path and query are preserved.
type redirectTransport struct {
	base string
}

// NewRedirectTransport returns a RoundTripper that rewrites every
// outgoing request to baseURL while preserving path and query.
func NewRedirectTransport(baseURL string) http.RoundTripper {
	return &redirectTransport{base: baseURL}
}

func (r *redirectTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	base, err := url.Parse(r.base)
	if err != nil {
		return nil, err
	}
	// The test server base URL is something like "http://127.0.0.1:43257".
	// We keep the request's path + query, swap scheme/host to the base.
	u := *req.URL
	u.Scheme = base.Scheme
	u.Host = base.Host
	if !strings.HasPrefix(u.Path, "/") {
		u.Path = "/" + u.Path
	}
	req2 := req.Clone(req.Context())
	req2.URL = &u
	return http.DefaultTransport.RoundTrip(req2)
}
