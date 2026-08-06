// Package planner decomposes high-level AI tasks into ordered subtasks.
//
// The planner uses a rule-based decomposition strategy. When the generated
// ai.proto stubs land (parallel lane), this will be swapped for a proto-
// typed planner that speaks gRPC with the AI service.
package planner

import (
	"context"
	"errors"
	"fmt"
	"sync"
)

var (
	// ErrMaxDepth is returned when decomposition exceeds the configured depth limit.
	ErrMaxDepth = errors.New("planner: max decomposition depth exceeded")
	// ErrEmptyGoal is returned when the input goal is empty.
	ErrEmptyGoal = errors.New("planner: goal must not be empty")
)

// TaskCategory enumerates the known task types.
type TaskCategory string

const (
	CategoryGeneration     TaskCategory = "generation"
	CategoryAnalysis       TaskCategory = "analysis"
	CategoryTransformation TaskCategory = "transformation"
	CategoryResearch       TaskCategory = "research"
)

// Subtask represents a single unit of work produced by the planner.
type Subtask struct {
	ID           string       `json:"id"`
	Title        string       `json:"title"`
	Description  string       `json:"description"`
	Category     TaskCategory `json:"category"`
	Dependencies []string     `json:"dependencies,omitempty"`
	Priority     int          `json:"priority"` // 0=highest
}

// Plan is the output of decomposition: an ordered list of subtasks.
type Plan struct {
	Goal     string    `json:"goal"`
	Subtasks []Subtask `json:"subtasks"`
}

// Planner decomposes goals into plans.
type Planner struct {
	mu       sync.RWMutex
	maxDepth int
	rules    map[TaskCategory]decompositionRule
}

type decompositionRule func(goal string, depth int) []Subtask

// New creates a Planner with the given max depth.
func New(maxDepth int) *Planner {
	if maxDepth <= 0 {
		maxDepth = 3
	}
	p := &Planner{
		maxDepth: maxDepth,
	}
	p.rules = map[TaskCategory]decompositionRule{
		CategoryGeneration:     p.generationRule,
		CategoryAnalysis:       p.analysisRule,
		CategoryTransformation: p.transformationRule,
		CategoryResearch:       p.researchRule,
	}
	return p
}

// Decompose breaks a goal into a Plan. The depth parameter tracks the
// current recursion level and is typically 0 for the initial call.
func (p *Planner) Decompose(ctx context.Context, goal string, depth int) (*Plan, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if goal == "" {
		return nil, ErrEmptyGoal
	}
	if depth >= p.maxDepth {
		return nil, ErrMaxDepth
	}

	category := classifyGoal(goal)

	p.mu.RLock()
	rule, ok := p.rules[category]
	p.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("planner: unknown category %q", category)
	}

	subtasks := rule(goal, depth+1)

	return &Plan{
		Goal:     goal,
		Subtasks: subtasks,
	}, nil
}

// classifyGoal determines which decomposition rule to apply.
func classifyGoal(goal string) TaskCategory {
	// Simple heuristic classification; will be upgraded when proto stubs land.
	lower := goal
	switch {
	case containsAny(lower, []string{"write", "generate", "create", "draft", "compose"}):
		return CategoryGeneration
	case containsAny(lower, []string{"analyze", "review", "evaluate", "inspect", "audit"}):
		return CategoryAnalysis
	case containsAny(lower, []string{"refactor", "transform", "migrate", "convert", "optimize"}):
		return CategoryTransformation
	case containsAny(lower, []string{"research", "investigate", "explore", "survey", "find"}):
		return CategoryResearch
	default:
		return CategoryGeneration
	}
}

func containsAny(s string, needles []string) bool {
	for _, n := range needles {
		if contains(s, n) {
			return true
		}
	}
	return false
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsSubstring(s, sub))
}

func containsSubstring(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

// ─── Decomposition rules ────────────────────────────────────────────

func (p *Planner) generationRule(goal string, depth int) []Subtask {
	return []Subtask{
		{ID: "parse", Title: "Parse requirements", Description: fmt.Sprintf("Understand: %s", goal), Category: CategoryAnalysis, Priority: 0},
		{ID: "outline", Title: "Create outline", Description: "Structure the output", Category: CategoryGeneration, Dependencies: []string{"parse"}, Priority: 1},
		{ID: "generate", Title: "Generate content", Description: "Produce the main output", Category: CategoryGeneration, Dependencies: []string{"outline"}, Priority: 2},
		{ID: "review", Title: "Self-review", Description: "Review and refine", Category: CategoryAnalysis, Dependencies: []string{"generate"}, Priority: 3},
	}
}

func (p *Planner) analysisRule(goal string, depth int) []Subtask {
	return []Subtask{
		{ID: "collect", Title: "Collect data", Description: "Gather relevant information", Category: CategoryResearch, Priority: 0},
		{ID: "analyze", Title: "Analyze", Description: "Perform the analysis", Category: CategoryAnalysis, Dependencies: []string{"collect"}, Priority: 1},
		{ID: "report", Title: "Report findings", Description: "Summarize results", Category: CategoryGeneration, Dependencies: []string{"analyze"}, Priority: 2},
	}
}

func (p *Planner) transformationRule(goal string, depth int) []Subtask {
	return []Subtask{
		{ID: "understand", Title: "Understand source", Description: "Map out what exists", Category: CategoryAnalysis, Priority: 0},
		{ID: "plan", Title: "Plan transformation", Description: "Define the transformation steps", Category: CategoryGeneration, Dependencies: []string{"understand"}, Priority: 1},
		{ID: "execute", Title: "Execute transformation", Description: "Apply changes", Category: CategoryTransformation, Dependencies: []string{"plan"}, Priority: 2},
		{ID: "validate", Title: "Validate result", Description: "Check correctness", Category: CategoryAnalysis, Dependencies: []string{"execute"}, Priority: 3},
	}
}

func (p *Planner) researchRule(goal string, depth int) []Subtask {
	return []Subtask{
		{ID: "scope", Title: "Scope research", Description: "Define research boundaries", Category: CategoryAnalysis, Priority: 0},
		{ID: "gather", Title: "Gather sources", Description: "Collect relevant materials", Category: CategoryResearch, Dependencies: []string{"scope"}, Priority: 1},
		{ID: "synthesize", Title: "Synthesize findings", Description: "Combine insights", Category: CategoryGeneration, Dependencies: []string{"gather"}, Priority: 2},
	}
}
