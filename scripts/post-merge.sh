#!/bin/bash
set -e
npm ci --workspaces --include-workspace-root
npm run push --workspace=@workspace/db
