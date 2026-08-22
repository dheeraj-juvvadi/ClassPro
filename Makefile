.PHONY: help build up down logs clean dev frontend backend


help: 
	@echo "ClassPro Docker Management"
	@echo "========================"
	@echo ""
	@echo "Available commands:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)


build: 
	docker compose build

up: 
	docker compose up -d

down: 
	docker compose down

logs: 
	docker compose logs -f

status: 
	docker compose ps


frontend-build: 
	docker build -t classpro-frontend ./frontend

frontend-up: 
	cd frontend && docker compose up -d

frontend-down: 
	cd frontend && docker compose down

frontend-logs: 
	cd frontend && docker compose logs -f

backend-build: 
	docker build -f dockerfile -t classpro-backend ./backend

backend-up: 
	cd backend && docker compose up -d

backend-down: 
	cd backend && docker compose down

backend-logs: 
	cd backend && docker compose logs -f


dev: 
	docker compose run --service-ports frontend bun run dev

dev-backend: 
	docker compose run --service-ports backend go run src/main.go


clean: 
	docker compose down --rmi all --volumes --remove-orphans
	docker system prune -f

restart: 
	docker compose restart

restart-frontend: 
	docker compose restart frontend

restart-backend: 
	docker compose restart backend


health: 
	@echo "Checking service health..."
	@docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"


shell-frontend: 
	docker compose exec frontend sh

shell-backend: 
	docker compose exec backend sh

start: build up
	@echo "ClassPro is starting..."
	@echo "Frontend: http://localhost:243"
	@echo "Backend:  http://localhost:8080"
	@echo ""
	@echo "Use 'make logs' to view logs"
	@echo "Use 'make down' to stop services" 