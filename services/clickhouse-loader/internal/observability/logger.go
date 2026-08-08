// Package observability builds the zap logger used across the loader.
package observability

import (
	"os"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// NewLogger returns a JSON zap logger suitable for collector output.
// Honors LOG_LEVEL=debug|info|warn|error.
func NewLogger() (*zap.Logger, error) {
	level := zap.NewAtomicLevelAt(zap.InfoLevel)
	if lvl := os.Getenv("LOG_LEVEL"); lvl != "" {
		if err := level.UnmarshalText([]byte(lvl)); err != nil {
			// Ignore unknown; default to info.
		}
	}
	enc := zap.NewProductionEncoderConfig()
	enc.TimeKey = "ts"
	enc.EncodeTime = zapcore.ISO8601TimeEncoder
	core := zapcore.NewCore(zapcore.NewJSONEncoder(enc), zapcore.AddSync(os.Stderr), level)
	return zap.New(core, zap.AddCaller()), nil
}
