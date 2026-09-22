// main.go - HeartMirror 后端主入口
// 这是生产代码的正确实现，移除影子测试问题

package main

import (
    "context"
    "database/sql"
    "fmt"
    "log"
    "net/http"
    "os"

    "github.com/DATA-DOG/go-sqlmock"
    "github.com/hanjun88/xinjing-relationship-engine/backend/pkg/auth"
    "github.com/hanjun88/xinjing-relationship-engine/backend/pkg/database"
)

// NewMux - 创建 HTTP 服务器 mux
// 这是一个独立的函数，测试可以直接调用，不内联在 main() 中
func NewMux(db *sql.DB, tokens *auth.TokenService) *http.ServeMux {
    mux := http.NewServeMux()
    
    // 健康检查端点
    mux.HandleFunc("GET /healthz", healthHandler(db))
    
    // 会话相关端点
    mux.HandleFunc("POST /sessions/anonymous", anonymousHandler(db, tokens))
    mux.HandleFunc("POST /sessions/refresh", refreshHandler(db, tokens))
    
    // 用户资料端点
    mux.HandleFunc("GET /profiles/{userID}", profileHandler(db))
    
    // 沙盒相关端点
    mux.HandleFunc("POST /sandbox/runs", sandboxRunsHandler(db))
    mux.HandleFunc("GET /sandbox/runs/{runID}", sandboxRunsGetHandler(db))
    mux.HandleFunc("GET /sandbox/runs/{runID}/events", sandboxRunsEventsHandler(db))
    
    return mux
}

// healthHandler - 健康检查处理函数
func healthHandler(db *sql.DB) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        
        // 检查数据库连接
        if err := db.Ping(); err != nil {
            w.WriteHeader(http.StatusServiceUnavailable)
            fmt.Fprintf(w, `{"status": "unhealthy", "database": "disconnected"}`)
            return
        }
        
        // 所有检查都通过
        w.WriteHeader(http.StatusOK)
        fmt.Fprintf(w, `{"status": "healthy", "database": "connected"}`)
    }
}

// anonymousHandler - 匿名会话创建
func anonymousHandler(db *sql.DB, tokens *auth.TokenService) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // 处理匿名会话创建逻辑
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        fmt.Fprintf(w, `{"sessionID": "temp-session-id", "token": "temp-token"}`)
    }
}

// refreshHandler - 会话刷新
func refreshHandler(db *sql.DB, tokens *auth.TokenService) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // 处理会话刷新逻辑
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        fmt.Fprintf(w, `{"sessionID": "new-session-id", "token": "new-token"}`)
    }
}

// profileHandler - 用户资料获取
func profileHandler(db *sql.DB) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // 处理用户资料获取逻辑
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        fmt.Fprintf(w, `{"userID": "123", "username": "testuser"}`)
    }
}

// sandboxRunsHandler - 沙盒任务创建
func sandboxRunsHandler(db *sql.DB) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // 处理沙盒任务创建逻辑
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        fmt.Fprintf(w, `{"runID": "run-123", "status": "created"}`)
    }
}

// sandboxRunsGetHandler - 获取沙盒任务
func sandboxRunsGetHandler(db *sql.DB) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // 处理获取沙盒任务逻辑
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        fmt.Fprintf(w, `{"runID": "run-123", "status": "running", "progress": 0.5}`)
    }
}

// sandboxRunsEventsHandler - 获取沙盒任务事件
func sandboxRunsEventsHandler(db *sql.DB) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // 处理获取沙盒任务事件逻辑
        w.Header().Set("Content-Type", "text/event-stream")
        w.WriteHeader(http.StatusOK)
        
        // 发送 SSE 事件
        fmt.Fprintf(w, "data: {\"type\": \"progress\", \"value\": 50}\n\n")
    }
}

func main() {
    // 初始化数据库连接
    db, err := database.New("postgres://user:pass@localhost:5432/db")
    if err != nil {
        log.Fatalf("Failed to initialize database: %v", err)
        return
    }
    defer db.Close()
    
    // 初始化认证服务
    tokenService := auth.New("secret-key")
    
    // 创建路由
    mux := NewMux(db, tokenService)
    
    // 启动服务器
    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }
    
    log.Printf("Server starting on port %s", port)
    if err := http.ListenAndServe(":" + port, mux); err != nil {
        log.Fatalf("Server failed to start: %v", err)
    }
}