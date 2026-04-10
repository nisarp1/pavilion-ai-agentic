# Pavilion-AI Agentic CMS - Quick Start Guide

**Status**: ✅ Week 0 Complete | Ready for Phase 1 Development

---

## 📋 What's Done

✅ **GitHub Repository** - https://github.com/nisarp1/pavilion-ai-agentic  
✅ **Code Complete** - Full Django + React stack with Vertex AI integration  
✅ **Infrastructure Files** - Docker, CI/CD, database schema  
✅ **Documentation** - Setup guides, API docs, implementation plan  
✅ **No Secrets** - All credentials removed, git history cleaned  

---

## 🚀 Next Steps (Choose One Path)

### Path A: Manual GCP Setup (Recommended - 10-15 minutes)

1. **Create GCP Project**
   - Visit https://console.cloud.google.com
   - Create project: `pavilion-ai-agentic`

2. **Enable APIs** (Click "Enable" for each)
   - Vertex AI API
   - Generative AI API  
   - Cloud SQL Admin API
   - Cloud Storage API
   - Cloud Run API
   - Cloud Tasks API

3. **Create Service Account**
   - IAM → Service Accounts → Create
   - Name: `pavilion-agentic`
   - Grant roles: Vertex AI User, Cloud SQL Client, Storage Admin, etc.

4. **Create & Download Key**
   - Service Account → Keys → Create JSON key
   - Save to: `.gcp-secrets/service-account-key.json`

5. **Start Local Development**
   ```bash
   cd ~/pavilion-ai-agentic
   docker-compose -f docker-compose.dev.yml up -d
   ```

### Path B: GCP Automated Setup (requires fixed gcloud auth)

```bash
cd ~/pavilion-ai-agentic
chmod +x setup-week0.sh
./setup-week0.sh
```

---

## 📂 Repository Structure

```
pavilion-ai-agentic/
├── backend/                      # Django REST API
│   ├── cms/                     # Article management
│   ├── agents/                  # AI agents (Phase 2)
│   ├── services/                # Vertex AI integrations
│   └── requirements-agentic.txt # 100+ Python packages
├── frontend/                    # React SPA
├── infrastructure/              # GCP setup files
│   ├── cloudsql/               # Database schema
│   └── vector_search/          # Vertex AI Vector Search
├── .github/workflows/           # GitHub Actions CI/CD
├── docker/                      # Docker images
├── docker-compose.dev.yml       # Local development
├── setup-week0.sh              # GCP automation script
├── SETUP_STATUS.md             # Detailed setup guide
├── QUICKSTART.md               # This file
└── README.md                   # Project overview
```

---

## 🐳 Local Development

### Start Everything
```bash
cd ~/pavilion-ai-agentic
docker-compose -f docker-compose.dev.yml up -d
```

### What Starts
- PostgreSQL (port 5432)
- Redis (port 6379)
- Django API (port 8000)
- React Frontend (port 3000)
- Celery Worker
- Celery Beat Scheduler

### Access
- 🌐 Frontend: http://localhost:3000
- 🔌 API: http://localhost:8000
- 👨‍💼 Admin: http://localhost:8000/admin
- 📖 API Docs: http://localhost:8000/api/schema/swagger/

### Common Commands
```bash
# View logs
docker-compose -f docker-compose.dev.yml logs -f django

# Run migrations
docker-compose -f docker-compose.dev.yml exec django python manage.py migrate

# Create admin user
docker-compose -f docker-compose.dev.yml exec django python manage.py createsuperuser

# Stop everything
docker-compose -f docker-compose.dev.yml down

# Clean up volumes
docker-compose -f docker-compose.dev.yml down -v
```

---

## 🔑 Configuration

### Development .env
Already created at `~/.env` with sensible defaults for:
- Local PostgreSQL (Docker)
- Local Redis (Docker)
- Vertex AI placeholders
- Django debug mode

### Update for Production
Before deploying:
1. `GOOGLE_PROJECT_ID` → Your GCP project ID
2. `SECRET_KEY` → Generate new value
3. `DEBUG` → `False`
4. `ALLOWED_HOSTS` → Your domain
5. Database credentials → Cloud SQL instance

---

## 📦 What's Included

### Backend Stack
- Django 4.2.7
- Django REST Framework 3.14.0
- PostgreSQL 15
- Google Cloud Aiplatform
- LangChain + Vertex AI integration
- Celery for async tasks
- Redis for caching
- pytest for testing

### Frontend Stack
- React 18+
- Vite/Webpack bundler
- Axios HTTP client
- Redux (optional)
- Tailwind CSS (optional)

### GCP Services
- Vertex AI (LLMs, Embeddings)
- Cloud SQL (PostgreSQL)
- Cloud Storage (Media)
- Cloud Run (Deployment)
- Secret Manager (Credentials)

---

## 🧪 Testing

### Run Tests
```bash
# All tests
docker-compose -f docker-compose.dev.yml exec django pytest

# Specific test file
docker-compose -f docker-compose.dev.yml exec django pytest tests/test_agents.py

# With coverage
docker-compose -f docker-compose.dev.yml exec django pytest --cov=backend tests/
```

### Test API Endpoints
```bash
# Health check
curl http://localhost:8000/api/health/

# List articles
curl http://localhost:8000/api/articles/

# Create article
curl -X POST http://localhost:8000/api/articles/ \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "body": "Content"}'
```

---

## 📊 Project Phases

| Phase | Goal | Timeline | Status |
|-------|------|----------|--------|
| **0** | Setup & Infrastructure | 2-3 hrs | ✅ Complete |
| **1** | RAG Pipeline & Embeddings | Week 1 | 🔄 Next |
| **2** | Multi-Agent System | Week 2 | ⏳ Planned |
| **3** | HITL Governance | Week 3 | ⏳ Planned |
| **4** | Analytics Loop | Week 4 | ⏳ Planned |
| **5** | GCP Services Integration | Week 5 | ⏳ Planned |
| **6** | Production Deployment | Week 6-7 | ⏳ Planned |

---

## 🆘 Common Issues

### "Cannot connect to Docker daemon"
→ Start Docker Desktop

### "Port already in use"
→ Change port in docker-compose.dev.yml or stop conflicting service

### "ModuleNotFoundError"
→ Rebuild containers: `docker-compose -f docker-compose.dev.yml build --no-cache`

### "Database connection refused"
→ Ensure postgres container is running: `docker-compose -f docker-compose.dev.yml ps`

### "GOOGLE_APPLICATION_CREDENTIALS not found"
→ Copy service account key: `cp ~/Downloads/key.json .gcp-secrets/service-account-key.json`

---

## 📚 Documentation

- **SETUP_STATUS.md** - Detailed setup instructions
- **README.md** - Project overview
- **Implementation Plan** - Full 750+ line technical roadmap
- **API Documentation** - Auto-generated at http://localhost:8000/api/schema/swagger/

---

## 🎯 Next Phase: RAG Pipeline (Week 1)

Once local dev is working, proceed to Phase 1:

1. **Vector Search Setup**
   - Create Vertex AI Vector Search index
   - Configure embeddings service

2. **Embedding Pipeline**
   - Implement Vertex AI Text Embeddings
   - Auto-generate on article save
   - Backfill existing articles

3. **Semantic Search Endpoint**
   - `POST /api/articles/semantic-search/`
   - Query embedding generation
   - Similarity scoring

See implementation plan for full details.

---

## 🤝 Contributing

All development happens in feature branches:

```bash
# Create feature branch
git checkout -b feature/rag-pipeline

# Make changes, commit
git add .
git commit -m "feat: Implement RAG pipeline"

# Push and create PR
git push origin feature/rag-pipeline
gh pr create --title "Add RAG Pipeline" --body "Implements semantic search..."
```

---

## 📞 Quick Links

- **GitHub**: https://github.com/nisarp1/pavilion-ai-agentic
- **GCP Console**: https://console.cloud.google.com
- **Documentation**: See ./SETUP_STATUS.md
- **Implementation Plan**: See ./docs/IMPLEMENTATION_PLAN.md (if present)

---

**Ready to build the future of agentic content management?** 🚀

Next: `docker-compose -f docker-compose.dev.yml up -d`
