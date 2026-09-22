// types.go -  HeartMirror 后端类型定义
// 接口定义用于解耦生产代码与测试代码

package main

import (
    "context"
    "time"
)

// PublishChannel - RabbitMQ 通道接口
// 抽象化具体的 *amqp091.Channel 类型，方便测试注入 mock
 type PublishChannel interface {
    PublishWithContext(ctx context.Context, exchange, key string, 
                       mandatory, immediate bool, msg amqp.Publishing) error
    Close() error
    ExchangeDeclare(name string, kind string, durable, autoDelete, 
                   internal, noWait bool, args map[string]interface{}) error
    // 其他必要的方法
    QueueDeclare(name string, durable, autoDelete, exclusive, noWait bool, args map[string]interface{}) (amqp.Queue, error)
    QueueBind(queueName, key, exchangeName string, noWait bool, args map[string]interface{}) error
    Consume(queue, consumer string, autoAck, exclusive, noLocal, noWait bool, args map[string]interface{}) (<-chan amqp.Delivery, error)
}

// Database - 数据库接口
// 抽象化具体的 *sql.DB 类型
 type Database interface {
    Query(query string, args ...interface{}) (*sql.Rows, error)
    QueryRow(query string, args ...interface{}) *sql.Row
    Exec(query string, args ...interface{}) (sql.Result, error)
    Ping() error
    Close() error
    // 其他必要的方法
    Begin() (*sql.Tx, error)
    BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error)
}

// TokenService - 令牌服务接口
// 抽象化具体的 auth.TokenService 类型
 type TokenService interface {
    GenerateToken(userID string, claims map[string]interface{}) (string, error)
    ValidateToken(token string) (map[string]interface{}, error)
    RefreshToken(token string) (string, error)
    RevokeToken(token string) error
}

// EventEmitter - 事件发射器接口
// 抽象化具体的事件发射逻辑
 type EventEmitter interface {
    Emit(eventType string, data interface{}) error
    Subscribe(eventType string, handler func(interface{})) error
    Unsubscribe(eventType string, handler func(interface{})) error
}

// MetricsCollector - 指标收集器接口
// 抽象化具体的指标收集逻辑
 type MetricsCollector interface {
    IncrementCounter(name string, labels map[string]string) error
    RecordHistogram(name string, value float64, labels map[string]string) error
    RecordGauge(name string, value float64, labels map[string]string) error
    // 其他指标方法
    Set(name string, value float64) error
}

// Config - 应用配置接口
// 抽象化具体的配置加载逻辑
 type Config interface {
    GetString(key string) string
    GetInt(key string) int
    GetBool(key string) bool
    GetStringSlice(key string) []string
    // 其他配置方法
    Sub(prefix string) Config
    Unmarshal(obj interface{}) error
}