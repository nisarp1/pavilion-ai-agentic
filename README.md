# Pavilion-AI Agentic CMS

A modern, AI-driven Content Management System powered by Vertex AI and Google Cloud Platform. This is a next-generation evolution of Pavilion-AI that transforms content creation through autonomous AI agents.

## 🚀 Features

- **Agentic Architecture**: Autonomous AI agents for content creation, optimization, and management
- **RAG Pipeline**: Retrieval-Augmented Generation with Vertex AI Embeddings
- **Semantic Search**: Intelligent content discovery powered by vector embeddings
- **Multi-Channel Content**: Generate content for web, social media, video, and audio
- **Google Cloud Native**: Built entirely on GCP with Cloud SQL, Cloud Storage, and Vertex AI
- **Auto-Scaling**: Cloud Run for automatic scaling and cost optimization
- **CI/CD Pipeline**: GitHub Actions for automated testing and deployment

## 📋 Prerequisites

- Google Cloud account with billing enabled
- GitHub account
- Python 3.9+
- Docker & Docker Compose (for local development)
- gcloud CLI

## 🔧 Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/nisarp1/pavilion-ai-agentic.git
cd pavilion-ai-agentic
```

### 2. Run Week 0 Setup

```bash
chmod +x setup-week0.sh
./setup-week0.sh
```

This automated script will:
- Create GCP project
- Enable required APIs
- Set up Cloud SQL and Cloud Storage
- Create service account with proper roles
- Generate `.env` configuration

### 3. Start Local Development

**Option A: Docker (Recommended)**
```bash
docker-compose -f docker-compose.dev.yml up -d
```

**Option B: Cloud SQL Proxy**
```bash
cloud_sql_proxy -instances=PROJECT_ID:us-central1:pavilion-db-dev=tcp:5432 &
cd backend && python manage.py migrate && python manage.py runserver
```

Access the application at: **http://localhost:8000**

## 📚 Documentation

- [Week 0 Setup Guide](QUICK_START_GUIDE.md)
- [Full Implementation Plan](/.claude/plans/frolicking-sniffing-hippo.md)
- [Architecture Overview](docs/ARCHITECTURE.md) (coming soon)
- [API Documentation](docs/API.md) (coming soon)
- [Agent Documentation](docs/AGENTS.md) (coming soon)

## 🏗️ Architecture

### Tech Stack

- **Backend**: Django REST Framework
- **Frontend**: React (optional)
- **Database**: Cloud SQL PostgreSQL
- **Vector Store**: Vertex AI Vector Search
- **LLM**: Vertex AI Gemini 2.0 Flash
- **Embeddings**: Vertex AI text-embedding-004
- **Hosting**: Cloud Run
- **Storage**: Cloud Storage
- **Task Queue**: Celery + Redis (development)
- **CI/CD**: GitHub Actions

### Project Structure

```
pavilion-ai-agentic/
├── backend/              # Django backend
│   ├── cms/             # Article management
│   ├── agents/          # AI agents
│   ├── analytics/       # Performance tracking
│   ├── services/        # GCP integrations
│   └── workers/         # Async tasks
├── frontend/            # React SPA
├── infrastructure/      # GCP setup scripts
├── docker/              # Docker configuration
├── .github/workflows/   # CI/CD pipeline
└── setup-week0.sh       # Automated setup
```

## 🤖 AI Agents

The system includes specialized agents for:

1. **Content Researcher** - Retrieves relevant content from knowledge base
2. **SEO & Readability Analyzer** - Optimizes content for search and readability
3. **Content Auditor** - Maintains content quality and compliance
4. **Fact Checker** - Validates claims against knowledge base (Phase 4)
5. **Performance Analyzer** - Analyzes metrics and recommends improvements (Phase 4)

## 💰 Cost Management

Estimated monthly costs:
- **Cloud SQL**: $7-15 (db-f1-micro tier)
- **Vertex AI**: Pay-per-use (embeddings/LLM)
- **Cloud Storage**: ~$0.01/GB
- **Cloud Run**: Free tier (12.5M requests/month)

**Total**: ~$20-30/month (can be reduced by deleting resources when not in use)

## 🔒 Security

- Service account credentials stored in Secret Manager
- Environment variables managed via Cloud Secret Manager
- No credentials committed to git
- Private GitHub repository
- Non-root container execution
- HTTPS enforced in production

## 📖 Development Workflow

### Local Development
```bash
# Start all services
docker-compose -f docker-compose.dev.yml up -d

# Run migrations
docker-compose -f docker-compose.dev.yml exec django python manage.py migrate

# Create superuser
docker-compose -f docker-compose.dev.yml exec django python manage.py createsuperuser

# Run tests
docker-compose -f docker-compose.dev.yml exec django python manage.py test

# Stop services
docker-compose -f docker-compose.dev.yml down
```

### Deployment

Push to `main` branch to deploy to production:
```bash
git push origin main
```

Push to `staging` branch to deploy to staging:
```bash
git push origin staging
```

GitHub Actions will automatically:
1. Run tests
2. Build Docker image
3. Push to Artifact Registry
4. Deploy to Cloud Run
5. Run migrations
6. Perform health checks

## 🧪 Testing

```bash
cd backend

# Run all tests
python manage.py test

# Run specific test
python manage.py test cms.tests.test_models

# Run with coverage
coverage run --source='.' manage.py test
coverage report
```

## 📝 Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
# Edit .env with your settings
```

Key configuration:
- `GOOGLE_PROJECT_ID` - Your GCP project ID
- `DATABASE_URL` - Cloud SQL connection string
- `GCS_BUCKET_MEDIA` - Media storage bucket
- `VERTEX_AI_MODEL` - LLM model to use
- `SECRET_KEY` - Django secret key

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/amazing-feature`
2. Commit changes: `git commit -m "Add amazing feature"`
3. Push to branch: `git push origin feature/amazing-feature`
4. Open Pull Request

## 📄 License

This project is proprietary and confidential.

## 👥 Support

For issues and questions:
1. Check documentation in `/docs`
2. Review error logs: `docker-compose -f docker-compose.dev.yml logs -f`
3. Consult implementation plan

## 🚦 Status

- ✅ Phase 0: GCP Infrastructure (Week 0)
- ⏳ Phase 1: RAG Pipeline (Week 1-2)
- ⏳ Phase 2: Agent Implementation (Week 3-4)
- ⏳ Phase 4: Analytics & Feedback Loop (Week 5)
- ⏳ Phase 5: Google Cloud Services (Week 6+)

---

**Built with ❤️ using Vertex AI and Google Cloud Platform**
