<img src="./public/icons/icon-192.png" alt="Dash Logo" width="64" height="64" align="left">

# Dash

**Agent Dashboard** - Analyze your Claude Code sessions to identify patterns and improve your development workflow.

## 🚀 Quick Start

### Web Version (Instant)

```bash
npx @jkershaw/dash
```

### Desktop App

Download the latest version for your platform:

- [macOS (Apple Silicon)](https://drive.google.com/file/d/1xe-Gbw_CzTyi43iWAVEFgZsgjiyYt4_d/view?usp=sharing) - `Dash-v1.3.2-macOS-arm64.dmg`

## What Dash Does

Dash automatically analyzes your Claude Code conversation logs to help you:

- **Identify Friction**: Spots tool loops, reading spirals, context switching, and other workflow bottlenecks
- **Get Actionable Insights**: Prioritized recommendations with implementation guides
- **Track Progress**: Timeline view of your coding sessions and improvement patterns
- **Enhance with AI**: Optional deep-dive analysis using Anthropic's Claude API

## 📊 Dashboard Features

- **Session Timeline** - Duration analysis and patterns over time
- **Pattern Visualization** - Workflow friction across projects
- **Historical Analysis** - Browse past analysis results
- **Session Explorer** - Dive into specific conversations and tool usage
- **Smart Recommendations** - Ranked suggestions based on impact and frequency

## 🤖 AI-Enhanced Analysis

For deeper insights, provide your Anthropic API key:

```bash
export ANTHROPIC_API_KEY=your-api-key
npx @jkershaw/dash
```

**Enhanced Features:**

- Multi-round investigation of specific sessions
- Cross-session pattern correlation
- Strategic recommendations based on actual session evidence
- Confidence scoring and detailed methodology

## ⚙️ Configuration

### Environment Variables

```bash
# Custom Claude Code logs location
export CLAUDE_LOGS_DIR=/path/to/logs

# Custom analysis output directory
export OUTPUT_DIR=./my-analysis

# Specify Claude model for AI analysis
export CLAUDE_MODEL=claude-sonnet-4-20250514

# Use specific port (default: random available port)
PORT=3000 npx @jkershaw/dash
```

### Default Log Locations

- **macOS**: `~/.claude/projects`
- **Windows**: `~/AppData/Roaming/Claude/projects`
- **Linux**: `~/.claude/projects`

## 📋 Requirements

- **Node.js 18+** (for web version)
- **Claude Code conversation logs** (automatically detected)
- **Anthropic API key** (optional, for enhanced analysis)

## 🆘 Troubleshooting

### Can't Find Claude Code Logs?

1. Check if Claude Code is installed and you've had conversations
2. Look in the default locations listed above
3. Use `CLAUDE_LOGS_DIR` to specify a custom path

### Port Already in Use?

```bash
# Use a specific port
PORT=3001 npx @jkershaw/dash

# Or let Dash find an available port (default behavior)
npx @jkershaw/dash
```

### Permission Issues (macOS)?

For the desktop app, you may need to grant full disk access:

1. System Preferences → Security & Privacy → Privacy
2. Select "Full Disk Access"
3. Add Dash.app to the list

## 🔗 Links

- **Issues**: [Report bugs or request features](https://github.com/jkershaw/dash/issues)
- **Releases**: [Download desktop apps](https://github.com/jkershaw/dash/releases)

---

<p align="center">
  <strong>Dash helps you become a more efficient Claude Code user</strong><br>
  Analyze patterns • Get insights • Improve workflows
</p>
