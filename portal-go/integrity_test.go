package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"
)

func TestCredentialIntegrity(t *testing.T) {
	nonce := "12345678-1234-1234-1234-123456789abc"
	password := "  synthetic&+=%<>\"'\\é🙂  "
	digest := func(field, value string) string {
		sum := sha256.Sum256([]byte(nonce + "\n" + field + "\n" + value))
		return hex.EncodeToString(sum[:])
	}
	proof := credentialIntegrity{nonce, digest("account", "student"), digest("password", password), digest("answer", "Ab12")}
	input := map[string]any{"account": "student@SRMIST.EDU.IN", "password": password, "answer": "Ab12", "integrity": proof}
	payload, _ := json.Marshal(input)
	if !validPayload("/api/login/client", payload) {
		t.Fatal("valid proof rejected")
	}
	checks := checkCredentialIntegrity(payload)
	if !checks["account_match"] || !checks["password_match"] || !checks["answer_match"] {
		t.Fatal("valid credentials mismatched")
	}
	input["password"] = "changed"
	payload, _ = json.Marshal(input)
	if checkCredentialIntegrity(payload)["password_match"] {
		t.Fatal("corruption not detected")
	}
	proof.Password = "invalid"
	input["integrity"] = proof
	payload, _ = json.Marshal(input)
	if validPayload("/api/login/client", payload) {
		t.Fatal("malformed proof accepted")
	}
}
