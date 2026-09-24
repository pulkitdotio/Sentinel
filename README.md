# Sentinel

Sentinel is a full-stack, distributed API uptime and latency monitoring platform built to demonstrate production-style backend and distributed systems concepts.

Users can register HTTP/HTTPS endpoints, monitor them from multiple regions, inspect historical checks and latency metrics, track automatically detected incidents, receive real-time dashboard updates, and optionally request AI-assisted health and incident analysis.

> **Sentinel keeps monitoring and incident decisions deterministic.** AI runs asynchronously and never decides whether a monitor is healthy, degraded, or down.

---

## Features

* Multi-region HTTP/HTTPS API monitoring
* Distributed probe workers
* BullMQ + Redis background job processing
* Automated scheduling of API checks
* MongoDB persistence
* Automatic incident detection and recovery
* Real-time dashboard updates using Socket.IO
* JWT authentication
* User-specific monitor isolation
* API latency tracking
* Uptime calculation
* p50, p95, and p99 latency metrics
* Configurable failure and recovery thresholds
* SSRF-aware outbound HTTP requests
* Optional AI-powered health insights
* Optional AI-generated incident summaries
* React dashboard
* Unit and integration tests with Vitest

---

## Architecture

Sentinel uses a **modular monolith with multiple independent runtime processes**.

The backend shares a single TypeScript codebase, while different processes handle API requests, scheduling, monitoring, incident detection, and AI analysis.

```text
                         ┌──────────────────────┐
                         │   React Dashboard    │
                         └──────────┬───────────┘
                                    │
                                    │ HTTP / Socket.IO
                                    ▼
                         ┌──────────────────────┐
                         │     Express API      │
                         │     + Socket.IO      │
                         └───────┬───────┬──────┘
                                 │       │
                         MongoDB │       │ Redis
                                 │       │
                                 ▼       ▼
                         ┌───────────┐  ┌─────────────┐
                         │ MongoDB   │  │ Redis       │
                         │ Database  │  │ + BullMQ    │
                         └───────────┘  └──────┬──────┘
                                              │
                         ┌────────────────────┼─────────────────────┐
                         │                    │                     │
                         ▼                    ▼                     ▼
                ┌────────────────┐   ┌────────────────┐   ┌────────────────┐
                │ Mumbai Worker  │   │Singapore Worker│   │Frankfurt Worker│
                └───────┬────────┘   └───────┬────────┘   └───────┬────────┘
                        │                    │                    │
                        └────────────────────┼────────────────────┘
                                             │
                                             ▼
                                   Monitored APIs

                         Redis / BullMQ
                              │
              ┌───────────────┴────────────────┐
              ▼                                ▼
     ┌─────────────────┐              ┌─────────────────┐
     │ Incident Worker │              │    AI Worker    │
     └─────────────────┘              └─────────────────┘
```

### Runtime Responsibilities

| Process         | Responsibility                                                           |
| --------------- | ------------------------------------------------------------------------ |
| API Server      | REST API, authentication, monitor CRUD, metrics, incidents and Socket.IO |
| Scheduler       | Finds monitors that need to be checked and creates regional probe jobs   |
| Probe Worker    | Performs HTTP checks from a configured region                            |
| Incident Worker | Determines health state and creates/resolves incidents                   |
| AI Worker       | Handles optional AI analysis requests                                    |
| Frontend        | Provides the monitoring dashboard and authentication UI                  |

---

## Tech Stack

### Backend

* Node.js
* TypeScript
* Express
* MongoDB
* Mongoose
* Redis
* BullMQ
* Socket.IO
* Zod
* Pino
* JWT
* Argon2
* OpenAI SDK
* Vitest
* Supertest

### Frontend

* React
* TypeScript
* Vite
* React Router
* TanStack Query
* React Hook Form
* Zod
* Tailwind CSS
* Motion
* Socket.IO Client
* Vitest
* Testing Library

---

## Project Structure

```text
Sentinel/
│
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   └── Express server, middleware and Socket.IO
│   │   │
│   │   ├── config/
│   │   │   └── Environment configuration and logging
│   │   │
│   │   ├── database/
│   │   │   └── MongoDB connection and models
│   │   │
│   │   ├── modules/
│   │   │   ├── authentication
│   │   │   ├── monitors
│   │   │   ├── metrics
│   │   │   ├── incidents
│   │   │   └── AI
│   │   │
│   │   ├── monitoring/
│   │   │   ├── HTTP checker
│   │   │   ├── transport
│   │   │   └── SSRF protection
│   │   │
│   │   ├── queues/
│   │   │   └── BullMQ queues and job contracts
│   │   │
│   │   ├── realtime/
│   │   │   └── Redis and Socket.IO events
│   │   │
│   │   ├── scheduler/
│   │   │   └── Monitor scheduling loop
│   │   │
│   │   └── workers/
│   │       ├── probe worker
│   │       ├── incident worker
│   │       └── AI worker
│   │
│   └── tests/
│
├── frontend/
│   └── src/
│       ├── api/
│       ├── app/
│       ├── auth/
│       ├── components/
│       ├── features/
│       ├── pages/
│       └── realtime/
│
└── README.md
```

---

# Getting Started

## Prerequisites

Before running Sentinel locally, make sure you have:

* Node.js 20+
* npm
* MongoDB
* Redis

By default, Sentinel expects:

```text
MongoDB: mongodb://localhost:27017
Redis:   redis://localhost:6379
```

---

## Installation

Clone the repository:

```bash
git clone <your-repository-url>
cd Sentinel
```

### Install Backend Dependencies

```bash
cd backend
npm install
```

### Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

---

# Environment Configuration

## Backend

Navigate to:

```bash
cd backend
```

Copy the example environment file:

```bash
cp .env.example .env
```

Example configuration:

```env
NODE_ENV=development

PORT=4000

LOG_LEVEL=debug

MONGODB_URI=mongodb://localhost:27017/sentinel

REDIS_URL=redis://localhost:6379

BULLMQ_PREFIX=sentinel

JWT_SECRET=replace-with-a-long-random-secret

JWT_EXPIRES_IN=7d

CLIENT_ORIGIN=http://localhost:5173

ENABLED_REGIONS=mumbai,singapore,frankfurt

PROBE_REGION=mumbai

PROBE_CONCURRENCY=20

SCHEDULER_POLL_INTERVAL_MS=5000

GLOBAL_CHECK_TIMEOUT_MS=10000

MAX_RESPONSE_BODY_BYTES=65536

ALLOW_PRIVATE_NETWORK_TARGETS=false

AI_ENABLED=false

OPENAI_API_KEY=your-openai-api-key

OPENAI_MODEL=your-supported-model

AI_REQUEST_TIMEOUT_MS=30000
```

Use a strong random value for:

```env
JWT_SECRET
```

AI configuration is only required when:

```env
AI_ENABLED=true
```

---

## Frontend

Navigate to:

```bash
cd frontend
```

Copy the environment example:

```bash
cp .env.example .env
```

Example:

```env
VITE_BACKEND_URL=http://localhost:4000
```

---

# Running the Project

Sentinel intentionally runs several backend processes independently.

For local development, open separate terminals for each process.

---

## 1. Start MongoDB

Make sure MongoDB is running locally.

The default connection is:

```text
mongodb://localhost:27017/sentinel
```

---

## 2. Start Redis

Make sure Redis is running on:

```text
redis://localhost:6379
```

---

## 3. Start the API Server

```bash
cd backend
npm run dev
```

The backend will be available at:

```text
http://localhost:4000
```

API base URL:

```text
http://localhost:4000/api/v1
```

Health endpoint:

```text
GET http://localhost:4000/api/v1/health
```

---

## 4. Start the Scheduler

Open another terminal:

```bash
cd backend
npm run dev:scheduler
```

The scheduler periodically looks for monitors that need to be checked.

---

## 5. Start Probe Workers

Sentinel can run multiple regional workers.

### Mumbai

```bash
cd backend
PROBE_REGION=mumbai npm run dev:probe
```

### Singapore

```bash
cd backend
PROBE_REGION=singapore npm run dev:probe
```

### Frankfurt

```bash
cd backend
PROBE_REGION=frankfurt npm run dev:probe
```

On PowerShell:

```powershell
$env:PROBE_REGION="mumbai"
npm run dev:probe
```

Each worker consumes only jobs assigned to its configured region.

In local development, all workers can run on the same machine.

In production, they can be deployed to different geographic locations.

---

## 6. Start the Incident Worker

```bash
cd backend
npm run dev:incident
```

The incident worker analyzes recent monitoring results and determines whether a monitor should be:

```text
healthy
degraded
down
```

It also automatically creates and resolves incidents.

---

## 7. Start the AI Worker

The AI worker is optional.

First enable AI:

```env
AI_ENABLED=true
```

Then configure:

```env
OPENAI_API_KEY=your-key
OPENAI_MODEL=your-model
```

Start the worker:

```bash
cd backend
npm run dev:ai
```

If AI is disabled, the monitoring system continues to work normally.

---

## 8. Start the Frontend

```bash
cd frontend
npm run dev
```

Open:

```text
http://localhost:5173
```

---

# Local Development Processes

With the default three monitoring regions, a complete development environment consists of:

```text
MongoDB
Redis
API Server
Scheduler
Mumbai Probe Worker
Singapore Probe Worker
Frankfurt Probe Worker
Incident Worker
Frontend
```

The AI worker can optionally be added.

---

# How Sentinel Works

When a user creates a monitor, Sentinel follows this flow:

```text
Create Monitor
      │
      ▼
Scheduler detects due monitor
      │
      ▼
Creates one probe job per region
      │
      ▼
Regional probe workers execute HTTP checks
      │
      ▼
Check results stored in MongoDB
      │
      ▼
Incident evaluation job created
      │
      ▼
Incident worker evaluates recent results
      │
      ▼
Monitor status updated
      │
      ▼
Realtime event published
      │
      ▼
React dashboard updates
```

In more detail:

1. A user creates a monitor.
2. The monitor contains a URL, interval, timeout, regions and thresholds.
3. The scheduler finds monitors whose next check time has arrived.
4. A BullMQ job is generated for each configured region.
5. Regional probe workers perform the HTTP request.
6. Results are stored in MongoDB.
7. An incident evaluation job is queued.
8. The incident worker examines recent regional results.
9. Monitor health is recalculated.
10. Incidents are opened or resolved if required.
11. Redis publishes a real-time domain event.
12. Socket.IO sends the update to the authenticated dashboard.
13. The frontend refreshes the appropriate data.

---

# Monitor Configuration

Each monitor can contain:

* Monitor name
* HTTP/HTTPS URL
* HTTP method
* Check interval
* Request timeout
* Expected HTTP status codes
* Latency warning threshold
* Failure threshold
* Recovery threshold
* Enabled regions
* Active or paused state

Supported methods include:

```text
GET
HEAD
```

The minimum monitoring interval is currently:

```text
10 seconds
```

The maximum per-monitor timeout is:

```text
30 seconds
```

---

# Monitor States

A monitor can have the following states:

```text
pending
healthy
degraded
down
paused
```

Example lifecycle:

```text
pending
   │
   ▼
healthy
   │
   ├─────────────► degraded
   │                  │
   │                  ▼
   │                 down
   │                  │
   └──────────────────┘
```

Paused monitors use:

```text
paused
```

---

# Incident Detection

Incident detection is intentionally deterministic.

Sentinel does **not** use AI to decide whether an API is down.

A single failed HTTP request does not necessarily create an incident.

Instead, Sentinel evaluates:

* Recent checks
* Regional results
* Consecutive failures
* Consecutive successful checks
* Configured failure threshold
* Configured recovery threshold

This helps avoid creating incidents for temporary network failures.

The incident worker also prevents duplicate active incidents.

Once the recovery criteria are satisfied, the existing incident is automatically resolved.

---

# Metrics

Sentinel calculates monitoring statistics such as:

* Uptime percentage
* Average latency
* p50 latency
* p95 latency
* p99 latency
* Recent check history
* Regional health
* Recent incidents

Example:

```text
Uptime:       99.95%
Avg Latency:  182 ms
p50:          160 ms
p95:          310 ms
p99:          470 ms
```

All metrics are scoped to the authenticated monitor owner.

---

# API Overview

All API endpoints are available under:

```text
/api/v1
```

---

## Authentication

### Register

```http
POST /api/v1/auth/register
```

Creates a new user account.

### Login

```http
POST /api/v1/auth/login
```

Authenticates the user and returns a JWT.

### Current User

```http
GET /api/v1/auth/me
```

Returns the currently authenticated user.

---

# Monitor APIs

### Create Monitor

```http
POST /api/v1/monitors
```

### Get Monitors

```http
GET /api/v1/monitors
```

### Get Monitor

```http
GET /api/v1/monitors/:monitorId
```

### Update Monitor

```http
PATCH /api/v1/monitors/:monitorId
```

### Delete Monitor

```http
DELETE /api/v1/monitors/:monitorId
```

### Pause Monitor

```http
POST /api/v1/monitors/:monitorId/pause
```

### Resume Monitor

```http
POST /api/v1/monitors/:monitorId/resume
```

---

# Checks and Metrics APIs

### Check History

```http
GET /api/v1/monitors/:monitorId/checks
```

Returns paginated monitoring history.

### Monitor Metrics

```http
GET /api/v1/monitors/:monitorId/metrics
```

Returns uptime and latency statistics.

---

# Incident APIs

### Monitor Incidents

```http
GET /api/v1/monitors/:monitorId/incidents
```

### Incident Details

```http
GET /api/v1/incidents/:incidentId
```

Returns the incident and its timeline.

---

# AI APIs

### Monitor Health Analysis

```http
POST /api/v1/monitors/:monitorId/ai-insights
```

Queues an asynchronous AI health analysis.

### Incident AI Summary

```http
POST /api/v1/incidents/:incidentId/ai-summary
```

Queues an AI-generated incident summary.

### AI Analysis Status

```http
GET /api/v1/ai-analyses/:analysisId
```

Returns the current analysis state and result.

---

# Real-Time Updates

Sentinel uses Socket.IO for live dashboard updates.

Supported events include:

```text
check.completed

monitor.status_changed

incident.opened

incident.resolved

ai.analysis.completed

ai.analysis.failed
```

Workers publish domain events through Redis.

The API server receives those events and forwards them to authenticated Socket.IO clients.

This allows backend workers to remain independent from the API server's process memory.

---

# AI Analysis

Sentinel contains optional AI functionality.

AI is deliberately isolated from the monitoring system's critical decision path.

## Monitor Health Insight

Users can request an AI-generated summary of recent monitor health and latency information.

The model receives bounded monitoring telemetry rather than unrestricted raw data.

## Incident Summary

Users can request an AI-generated explanation of a resolved incident using:

* Incident timeline
* Regional checks
* Latency information
* Failure patterns
* Recovery information

---

## AI Safety Principles

AI functionality follows several rules:

* AI is explicitly requested by the user.
* AI runs asynchronously.
* AI does not determine monitor health.
* AI does not open incidents.
* AI does not resolve incidents.
* Provider failures do not break monitoring.
* AI output is validated before persistence.
* Response bodies are not unnecessarily sent to the AI provider.
* Monitoring continues normally when AI is disabled.

---

# Security

Sentinel contains several protections that are especially important for an uptime monitoring platform.

## Authentication

Protected endpoints require JWT authentication.

Passwords are hashed using:

```text
Argon2
```

---

## Resource Isolation

Users can only access their own:

* Monitors
* Checks
* Metrics
* Incidents
* AI analyses

Socket.IO connections are also authenticated and user-scoped.

---

## SSRF Protection

Monitoring platforms make HTTP requests to user-provided URLs, which can create SSRF risks.

Sentinel protects against this by validating monitoring destinations.

By default:

```env
ALLOW_PRIVATE_NETWORK_TARGETS=false
```

Private network destinations are blocked.

Monitor URLs:

* Must use HTTP or HTTPS
* Cannot contain embedded authentication credentials
* Are checked before requests are performed
* Have redirect destinations validated

---

## Request Limits

HTTP checks are bounded by:

```env
GLOBAL_CHECK_TIMEOUT_MS
MAX_RESPONSE_BODY_BYTES
```

This prevents monitored endpoints from causing unlimited response reads or indefinitely hanging worker requests.

---

# Testing

## Backend Tests

```bash
cd backend
npm test
```

### Integration Tests

```bash
npm run test:integration
```

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

---

## Frontend Tests

```bash
cd frontend
npm test
```

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

---

# Production Build

## Backend

Build the backend:

```bash
cd backend
npm run build
```

Start the main API:

```bash
npm start
```

Other production runtime commands include:

```bash
npm run start:scheduler
```

```bash
npm run start:probe
```

```bash
npm run start:incident
```

```bash
npm run start:ai
```

Each probe worker still requires its own:

```env
PROBE_REGION
```

For example:

```bash
PROBE_REGION=mumbai npm run start:probe
```

---

## Frontend

Build the frontend:

```bash
cd frontend
npm run build
```

Vite generates the production frontend inside:

```text
frontend/dist/
```

---


# Current Scope

Sentinel focuses on the core engineering challenges involved in building a distributed monitoring platform.

The current version intentionally does not attempt to reproduce every feature of commercial monitoring systems.

Possible future additions include:

* Email notifications
* Slack notifications
* Discord notifications
* Webhook alerts
* Public status pages
* Team accounts
* Role-based access control
* Browser synthetic monitoring
* TCP monitoring
* ICMP monitoring
* SSL certificate expiration monitoring
* Domain expiration monitoring
* Kubernetes deployment
* Billing and subscription plans
* Additional monitoring regions
* Alert escalation policies
* Scheduled maintenance windows

---

# Why Sentinel?

Sentinel was built to explore engineering concepts that appear in real production systems.

The project demonstrates:

* Distributed background processing
* Queue-based architecture
* Worker concurrency
* Multi-region processing
* Asynchronous workloads
* Idempotency
* Failure isolation
* Real-time systems
* State machines
* Incident lifecycle management
* API authentication
* User resource isolation
* MongoDB data modeling
* Operational metrics
* SSRF protection
* Safe outbound HTTP handling
* AI integration outside critical infrastructure decisions

Rather than building only a CRUD dashboard, Sentinel focuses on the infrastructure and failure-handling problems involved in creating a real monitoring service.

---

# License

This project is intended primarily for educational and portfolio purposes.

---

If you found this project useful, consider giving the repository a ⭐.
