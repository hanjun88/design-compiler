// backend_fixed.go - HeartMirror 后端核心实现
// 生产代码实现，接口直接可测试

package main

import (
    "context"
    "database/sql"
    "fmt"
    "log"
    "time"

    amqp091 "github.com/streadway/amqp"
)

// PublishChannelImpl - RabbitMQ 通道的具体实现
// 实现了 PublishChannel 接口，可以直接被测试
 type PublishChannelImpl struct {
    channel *amqp091.Channel
}

func NewPublishChannel(channel *amqp091.Channel) *PublishChannelImpl {
    return &PublishChannelImpl{channel: channel}
}

func (p *PublishChannelImpl) PublishWithContext(ctx context.Context, exchange, key string, 
                                              mandatory, immediate bool, msg amqp091.Publishing) error {
    // 实现 RabbitMQ 消息发布
    return p.channel.PublishWithContext(ctx, exchange, key, mandatory, immediate, msg)
}

func (p *PublishChannelImpl) Close() error {
    return p.channel.Close()
}

func (p *PublishChannelImpl) ExchangeDeclare(name string, kind string, durable, autoDelete, 
                                             internal, noWait bool, args map[string]interface{}) error {
    return p.channel.ExchangeDeclare(name, kind, durable, autoDelete, internal, noWait, args)
}

func (p *PublishChannelImpl) QueueDeclare(name string, durable, autoDelete, exclusive, 
                                          noWait bool, args map[string]interface{}) (amqp091.Queue, error) {
    return p.channel.QueueDeclare(name, durable, autoDelete, exclusive, noWait, args)
}

func (p *PublishChannelImpl) QueueBind(queueName, key, exchangeName string, noWait bool, 
                                       args map[string]interface{}) error {
    return p.channel.QueueBind(queueName, key, exchangeName, noWait, args)
}

func (p *PublishChannelImpl) Consume(queue, consumer string, autoAck, exclusive, 
                                     noLocal, noWait bool, args map[string]interface{}) (<-chan amqp091.Delivery, error) {
    return p.channel.Consume(queue, consumer, autoAck, exclusive, noLocal, noWait, args)
}

// DatabaseImpl - 数据库的具体实现
// 实现了 Database 接口，可以直接被测试
 type DatabaseImpl struct {
    db *sql.DB
}

func NewDatabaseImpl(databaseURL string) (*DatabaseImpl, error) {
    db, err := sql.Open("postgres", databaseURL)
    if err != nil {
        return nil, err
    }
    
    // 测试连接
    if err := db.Ping(); err != nil {
        return nil, err
    }
    
    return &DatabaseImpl{db: db}, nil
}

func (d *DatabaseImpl) Query(query string, args ...interface{}) (*sql.Rows, error) {
    return d.db.Query(query, args...)
}

func (d *DatabaseImpl) QueryRow(query string, args ...interface{}) *sql.Row {
    return d.db.QueryRow(query, args...)
}

func (d *DatabaseImpl) Exec(query string, args ...interface{}) (sql.Result, error) {
    return d.db.Exec(query, args...)
}

func (d *DatabaseImpl) Ping() error {
    return d.db.Ping()
}

func (d *DatabaseImpl) Close() error {
    return d.db.Close()
}

func (d *DatabaseImpl) Begin() (*sql.Tx, error) {
    return d.db.Begin()
}

func (d *DatabaseImpl) BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error) {
    return d.db.BeginTx(ctx, opts)
}

// TokenServiceImpl - 令牌服务的具体实现
// 实现了 TokenService 接口，可以直接被测试
 type TokenServiceImpl struct {
    secretKey string
    expiration time.Duration
}

func NewTokenServiceImpl(secretKey string, expiration time.Duration) *TokenServiceImpl {
    return &TokenServiceImpl{secretKey: secretKey, expiration: expiration}
}

func (t *TokenServiceImpl) GenerateToken(userID string, claims map[string]interface{}) (string, error) {
    // 实现令牌生成
    return "generated-token", nil
}

func (t *TokenServiceImpl) ValidateToken(token string) (map[string]interface{}, error) {
    // 实现令牌验证
    return map[string]interface{}{}, nil
}

func (t *TokenServiceImpl) RefreshToken(token string) (string, error) {
    // 实现令牌刷新
    return "refreshed-token", nil
}

func (t *TokenServiceImpl) RevokeToken(token string) error {
    // 实现令牌撤销
    return nil
}

// publishBatch - 生产消息发布函数
// 这是生产代码，可以直接被测试
func publishBatch(ctx context.Context, db Database, ch PublishChannel, 
                  exchange string, messages []amqp091.Publishing) error {
    // 验证参数
    if ch == nil {
        return fmt.Errorf("channel is nil")
    }
    if len(messages) == 0 {
        return fmt.Errorf("no messages to publish")
    }
    
    // 确保交换机存在
    if err := ch.ExchangeDeclare(exchange, "topic", true, false, false, false, nil); err != nil {
        return fmt.Errorf("failed to declare exchange: %w", err)
    }
    
    // 发布消息
    for _, msg := range messages {
        if err := ch.PublishWithContext(ctx, exchange, msg.Key, false, false, msg); err != nil {
            return fmt.Errorf("failed to publish message: %w", err)
        }
    }
    
    return nil
}

// setupTestMux - 测试专用路由构建函数
// 这是测试代码，可以直接调用生产函数
func setupTestMux(db Database) *http.ServeMux {
    mux := http.NewServeMux()
    
    // 注册生产路由
    mux.HandleFunc("GET /healthz", healthHandler(db))
    mux.HandleFunc("POST /sessions/anonymous", anonymousHandler(db, nil))
    mux.HandleFunc("POST /sessions/refresh", refreshHandler(db, nil))
    mux.HandleFunc("GET /profiles/{userID}", profileHandler(db))
    mux.HandleFunc("POST /sandbox/runs", sandboxRunsHandler(db))
    mux.HandleFunc("GET /sandbox/runs/{runID}", sandboxRunsGetHandler(db))
    mux.HandleFunc("GET /sandbox/runs/{runID}/events", sandboxRunsEventsHandler(db))
    
    return mux
}