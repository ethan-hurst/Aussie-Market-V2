# 🤖 Multi-Agent System Documentation

This directory contains the configuration files for the Aussie-Market-V2 multi-agent development system.

## 🏗️ System Overview

The multi-agent system enables specialized AI agents to work collaboratively on different aspects of the project, each with specific expertise and responsibilities.

### Agent Architecture
```
Central AI Coordinator (Hub)
├── Backend Engineer (Server-side, CI/CD, Infrastructure)
├── Frontend Specialist (UI/UX, Client-side, Accessibility)
├── Supabase Specialist (Database, RLS, Real-time)
├── Security Auditor (Security, Compliance, Vulnerability Assessment)
├── Quality Engineer (Testing, Automation, Performance)
└── Session Librarian (Git, Documentation, Knowledge Management)
```

## 🎭 Agent Roles

### 🎯 Central AI Coordinator (`central-ai.md`)
- **Primary Role**: Strategic coordination and task management
- **Responsibilities**: Archon task creation, agent delegation, progress tracking
- **Authority**: Task assignment, priority management, quality gates

### 🔧 Backend Engineer (`backend-engineer.md`)
- **Primary Role**: Server-side development and infrastructure
- **Responsibilities**: APIs, Edge Functions, CI/CD, performance optimization
- **Specialties**: SvelteKit, Supabase, GitHub Actions, database integration

### 🎨 Frontend Specialist (`frontend-specialist.md`)
- **Primary Role**: User interface and experience development
- **Responsibilities**: Svelte components, accessibility, client-side logic
- **Specialties**: UI/UX design, Tailwind CSS, real-time updates, mobile optimization

### 🗄️ Supabase Specialist (`supabase-specialist.md`)
- **Primary Role**: Database design and platform integration
- **Responsibilities**: Schema design, RLS policies, real-time subscriptions
- **Specialties**: PostgreSQL, Supabase services, performance tuning, migrations

### 🔒 Security Auditor (`security-auditor.md`)
- **Primary Role**: Security analysis and compliance
- **Responsibilities**: Vulnerability assessment, security reviews, compliance
- **Specialties**: OWASP, authentication, data protection, penetration testing

### 🧪 Quality Engineer (`quality-engineer.md`)
- **Primary Role**: Testing and quality assurance
- **Responsibilities**: Test automation, performance testing, quality metrics
- **Specialties**: Playwright, Vitest, load testing, accessibility testing

### 📚 Session Librarian (`session-librarian.md`)
- **Primary Role**: Documentation and version control
- **Responsibilities**: Git operations, documentation, knowledge management
- **Specialties**: Git workflows, technical writing, code organization

## 🚀 Quick Start Guide

### 1. Activate Central AI Coordinator
```markdown
Load the main AGENTS.md file in your Cursor session to become the Central AI Coordinator.
```

### 2. Activate a Specialist Agent
```markdown
1. Open a new Cursor tab/instance
2. Load the specific agent configuration file (e.g., `.agents/backend-engineer.md`)
3. The agent persona will override the default Central AI role
4. Check assigned Archon tasks and update status to "doing"
```

### 3. Multi-Agent Workflow
```
User Request → Central AI Coordinator
     ↓
Central AI creates Archon task
     ↓
Central AI assigns to appropriate specialist
     ↓
Specialist loads their configuration
     ↓
Specialist executes work (doing → review)
     ↓
Central AI validates and coordinates handoffs
     ↓
Task completion and status updates
```

## 🔄 Communication Protocols

### Task Handoff Protocol
1. **Central AI** creates detailed Archon task with requirements
2. **Central AI** assigns to appropriate specialist based on domain
3. **Specialist** updates task status to "doing" when starting work
4. **Specialist** provides regular progress updates in task description
5. **Specialist** updates status to "review" when implementation complete
6. **Central AI** validates work and moves to "done" or provides feedback

### Inter-Agent Collaboration
- **Shared Context**: All agents have access to project files and Archon tasks
- **Direct References**: Agents can reference each other's work and decisions
- **Conflict Resolution**: Central AI mediates overlaps and technical decisions
- **Knowledge Sharing**: Session Librarian maintains shared documentation

### Status Reporting Standards
```markdown
## Progress Update Format
- **Started**: [timestamp] - Brief description of work begun
- **Progress**: [timestamp] - Specific accomplishments and next steps
- **Blocked**: [timestamp] - Clear description of blockers and help needed
- **Complete**: [timestamp] - Summary of work completed and validation criteria
```

## 🎯 Agent Activation Examples

### Backend Engineer Activation
```markdown
1. Load `.agents/backend-engineer.md` in new Cursor instance
2. Check Archon tasks assigned to "Backend Engineer" or "AI IDE Agent"
3. Update task status to "doing": 
   - Task: "Create staging canary E2E gate"
   - Status: todo → doing
4. Begin implementation focusing on server-side requirements
5. Update task with progress and move to "review" when complete
```

### Frontend Specialist Activation
```markdown
1. Load `.agents/frontend-specialist.md` in new Cursor instance
2. Review UI/UX tasks in Archon system
3. Focus on accessibility, performance, and user experience
4. Coordinate with Backend Engineer on API contracts
5. Ensure WCAG AA compliance and mobile responsiveness
```

## 🛠️ Development Workflow

### For Complex Tasks (Multi-Agent)
1. **Central AI** analyzes requirements and creates detailed task
2. **Central AI** determines if Master Orchestrator enrichment needed
3. **Central AI** breaks down into specialist assignments
4. **Specialists** work in parallel on independent components
5. **Central AI** coordinates integration and handoffs
6. **Session Librarian** documents decisions and commits changes

### For Simple Tasks (Single Agent)
1. **Central AI** creates task and assigns directly to specialist
2. **Specialist** executes work independently
3. **Specialist** updates status and reports completion
4. **Central AI** validates and marks task complete

### For Cross-Cutting Concerns
1. **Security Auditor** reviews all security-related changes
2. **Quality Engineer** validates testing and performance requirements
3. **Session Librarian** ensures proper documentation and version control
4. **Central AI** coordinates reviews and approvals

## 📋 Best Practices

### Agent Activation
- Always load the specific agent configuration file
- Check current Archon tasks before starting work
- Update task status immediately when beginning work
- Provide detailed progress updates throughout implementation

### Communication
- Use task descriptions for detailed progress updates
- Reference other agents' work when building on their contributions
- Escalate conflicts or unclear requirements to Central AI
- Document important decisions and technical choices

### Quality Assurance
- Follow agent-specific quality standards and protocols
- Ensure work meets performance and security requirements
- Include proper testing and validation before marking complete
- Maintain consistency with project architecture and patterns

## 🚨 Troubleshooting

### Agent Not Loading Correctly
- Ensure the agent configuration file is loaded at the END of context
- Check that the file contains "🏗️ Role Definition:" header
- Verify the agent persona is overriding Central AI role

### Task Assignment Issues
- Central AI should check agent specialties before assignment
- Ensure task requirements match agent capabilities
- Escalate cross-domain tasks to Central AI for coordination

### Communication Breakdowns
- Use Archon task updates as primary communication channel
- Reference specific task IDs when discussing work
- Session Librarian maintains documentation of decisions

## 📊 Success Metrics

### System Effectiveness
- Task completion velocity and quality
- Reduced conflicts and rework
- Clear separation of concerns maintained
- Effective knowledge sharing and documentation

### Agent Performance
- Specialists complete tasks within their domain expertise
- Quality standards maintained across all work
- Proper coordination and handoffs between agents
- Continuous improvement in workflows and processes

---

**System Status**: ✅ Ready for multi-agent deployment  
**Last Updated**: 2025-09-08  
**Version**: 1.0

For questions or issues with the multi-agent system, consult the Central AI Coordinator or Session Librarian.
