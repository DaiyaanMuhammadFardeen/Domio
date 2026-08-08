// Package config holds the loader configuration loaded from env.
package config

// LoaderConfig captures every tunable for the clickhouse-loader.
type LoaderConfig struct {
	KafkaBrokers   string
	KafkaTopic     string
	KafkaGroupID   string
	KafkaDLQTopic  string
	ClickHouseAddr string
	ClickHouseDB   string
	ClickHouseUser string
	ClickHousePass string
	HealthPort     string
	BatchMaxRows   int
	BatchMaxMS     int
	Concurrency    int
}
