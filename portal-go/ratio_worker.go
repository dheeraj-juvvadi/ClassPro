package main

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"os/exec"
	"sync"
)

type ratioProcess struct {
	command *exec.Cmd
	input   io.WriteCloser
	output  *bufio.Scanner
	mu      sync.Mutex
}

type ratioWorker struct {
	mu             sync.Mutex
	processes      map[string]*ratioProcess
	python, script string
}

func newRatioWorker() *ratioWorker {
	return &ratioWorker{processes: make(map[string]*ratioProcess), python: env("RATIO_PYTHON", "/opt/ratio/bin/python"), script: env("RATIO_SCRIPT", "/app/portal-python/adapter.py")}
}

func (backend *ratioWorker) close(id string) {
	backend.mu.Lock()
	process := backend.processes[id]
	delete(backend.processes, id)
	backend.mu.Unlock()
	if process != nil {
		_ = process.command.Process.Kill()
		_ = process.input.Close()
		_ = process.command.Wait()
	}
}

func (backend *ratioWorker) shutdown() {
	backend.mu.Lock()
	ids := make([]string, 0, len(backend.processes))
	for id := range backend.processes {
		ids = append(ids, id)
	}
	backend.mu.Unlock()
	for _, id := range ids {
		backend.close(id)
	}
}

func (backend *ratioWorker) Call(ctx context.Context, action, id string, payload json.RawMessage) reply {
	if action == "close" {
		backend.close(id)
		return jsonReply(200, map[string]bool{"success": true})
	}
	backend.mu.Lock()
	process := backend.processes[id]
	if process == nil && action == "challenge" {
		command := exec.Command(backend.python, "-u", backend.script)
		input, inputErr := command.StdinPipe()
		output, outputErr := command.StdoutPipe()
		if inputErr != nil || outputErr != nil || command.Start() != nil {
			backend.mu.Unlock()
			return unavailable()
		}
		scanner := bufio.NewScanner(output)
		scanner.Buffer(make([]byte, 4096), 2*1024*1024)
		process = &ratioProcess{command: command, input: input, output: scanner}
		backend.processes[id] = process
	}
	backend.mu.Unlock()
	if process == nil {
		return failure(401, "SESSION_EXPIRED", "Start a new sign-in.")
	}
	process.mu.Lock()
	defer process.mu.Unlock()
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	message, _ := json.Marshal(map[string]any{"action": action, "payload": payload})
	completed := make(chan []byte, 1)
	go func() {
		if _, err := process.input.Write(append(message, '\n')); err != nil {
			completed <- nil
			return
		}
		if !process.output.Scan() {
			completed <- nil
			return
		}
		completed <- append([]byte(nil), process.output.Bytes()...)
	}()
	select {
	case <-ctx.Done():
		backend.close(id)
		return unavailable()
	case data := <-completed:
		var envelope struct {
			Status int
			Body   json.RawMessage
			Events []map[string]any
		}
		if json.Unmarshal(data, &envelope) != nil || envelope.Status < 200 || envelope.Status > 599 {
			backend.close(id)
			return unavailable()
		}
		requestID, _ := ctx.Value(requestIDKey{}).(string)
		slog.InfoContext(ctx, "ratio_client", "request_id", requestID, "action", action, "status", envelope.Status, "events", envelope.Events)
		return ratioReply(action, envelope.Status, envelope.Body)
	}
}
