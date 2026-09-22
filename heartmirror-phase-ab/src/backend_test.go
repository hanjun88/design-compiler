// backend_test.go - 测试生产代码
// 这是测试文件，直接调用生产代码，不复制生产代码

package main

import (
    "context"
    "testing"

    amqp091 "github.com/streadway/amqp"
    "github.com/stretchr/testify/assert"
)

// MockPublishChannel - RabbitMQ 通道的 mock 实现
// 这是一个用于测试的 mock，实现 PublishChannel 接口
 type MockPublishChannel struct {
    publishedMessages []amqp091.Publishing
    exchangeDeclared  bool
}

func (m *MockPublishChannel) PublishWithContext(ctx context.Context, exchange, key string, 
                                                 mandatory, immediate bool, msg amqp091.Publishing) error {
    m.publishedMessages = append(m.publishedMessages, msg)
    return nil
}

func (m *MockPublishChannel) Close() error {
    return nil
}

func (m *MockPublishChannel) ExchangeDeclare(name string, kind string, durable, autoDelete, 
                                             internal, noWait bool, args map[string]interface{}) error {
    m.exchangeDeclared = true
    return nil
}

func (m *MockPublishChannel) QueueDeclare(name string, durable, autoDelete, exclusive, 
                                          noWait bool, args map[string]interface{}) (amqp091.Queue, error) {
    return amqp091.Queue{}, nil
}

func (m *MockPublishChannel) QueueBind(queueName, key, exchangeName string, noWait bool, 
                                       args map[string]interface{}) error {
    return nil
}

func (m *MockPublishChannel) Consume(queue, consumer string, autoAck, exclusive, 
                                     noLocal, noWait bool, args map[string]interface{}) (<-chan amqp091.Delivery, error) {
    return nil, nil
}

// TestPublishBatch_Success - 测试 publishBatch 的成功情况
func TestPublishBatch_Success(t *testing.T) {
    // 创建 mock 对象
    mockCh := &MockPublishChannel{}
    mockDB := &MockDatabase{} // 需要在 test 文件中实现 MockDatabase
    
    // 创建测试消息
    messages := []amqp091.Publishing{
        {Key: "test.queue", Body: []byte("test message 1")},
        {Key: "test.queue", Body: []byte("test message 2")},
    }
    
    // 调用生产代码
    err := publishBatch(context.Background(), mockDB, mockCh, "test.exchange", messages)
    
    // 验证结果
    assert.NoError(t, err)
    assert.True(t, mockCh.exchangeDeclared)
    assert.Len(t, mockCh.publishedMessages, 2)
    assert.Equal(t, "test.queue", mockCh.publishedMessages[0].Key)
    assert.Equal(t, "test.queue", mockCh.publishedMessages[1].Key)
}

// TestPublishBatch_NoChannel - 测试 publishBatch 的 nil 通道情况
func TestPublishBatch_NoChannel(t *testing.T) {
    // 创建 mock 数据库
    mockDB := &MockDatabase{} // 需要在 test 文件中实现 MockDatabase
    
    // 创建 nil 通道
    var mockCh PublishChannel = nil
    
    // 创建测试消息
    messages := []amqp091.Publishing{{Key: "test.queue", Body: []byte("test")}}
    
    // 调用生产代码
    err := publishBatch(context.Background(), mockDB, mockCh, "test.exchange", messages)
    
    // 验证结果
    assert.Error(t, err)
    assert.Contains(t, err.Error(), "channel is nil")
}

// TestPublishBatch_EmptyMessages - 测试 publishBatch 的空消息情况
func TestPublishBatch_EmptyMessages(t *testing.T) {
    // 创建 mock 对象
    mockCh := &MockPublishChannel{}
    mockDB := &MockDatabase{} // 需要在 test 文件中实现 MockDatabase
    
    // 创建空消息列表
    messages := []amqp091.Publishing{}
    
    // 调用生产代码
    err := publishBatch(context.Background(), mockDB, mockCh, "test.exchange", messages)
    
    // 验证结果
    assert.Error(t, err)
    assert.Contains(t, err.Error(), "no messages to publish")
}

// Note: MockDatabase needs to be defined in this test file
// For now, we'll add it here to make the tests compile
// In a real scenario, this would be in a separate test utilities file

// MockDatabase - 数据库的 mock 实现
// 这是一个用于测试的 mock，实现 Database 接口
 type MockDatabase struct {
    QueryResult   *sql.Rows
    QueryError    error
    ExecResult    sql.Result
    ExecError     error
    PingError     error
}

func (m *MockDatabase) Query(query string, args ...interface{}) (*sql.Rows, error) {
    return m.QueryResult, m.QueryError
}

func (m *MockDatabase) QueryRow(query string, args ...interface{}) *sql.Row {
    return nil
}

func (m *MockDatabase) Exec(query string, args ...interface{}) (sql.Result, error) {
    return m.ExecResult, m.ExecError
}

func (m *MockDatabase) Ping() error {
    return m.PingError
}

func (m *MockDatabase) Close() error {
    return nil
}

func (m *MockDatabase) Begin() (*sql.Tx, error) {
    return nil, nil
}

func (m *MockDatabase) BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error) {
    return nil, nil
}