# Pisces Monorepo Command Menu

# Default recipe: list all available commands
default:
    @just --list

# Run all TypeScript and Rust checks
check:
    bun run check

# Format all TypeScript and Rust code
fmt:
    bun run fmt

# Apply all automatic fixes (TS + Rust)
fix:
    bun run fix

# Run all tests across the monorepo
test:
    bun run test

# Start the coding agent in development mode
dev:
    bun run dev

# Build the Rust native binaries
build:
    bun run build:native

# Run the release pipeline
release:
    bun run release

# Generate AI models
generate-models:
    bun run generate-models

# Sync package exports
sync-exports:
    bun run sync-exports

# Generate docs index
generate-docs:
    bun run generate-docs-index
