package main

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"strings"
)

type credentialIntegrity struct {
	Nonce    string `json:"nonce"`
	Account  string `json:"account"`
	Password string `json:"password"`
	Answer   string `json:"answer"`
}

func validIntegrity(proof credentialIntegrity) bool {
	if !diagnosticID.MatchString(proof.Nonce) {
		return false
	}
	for _, value := range []string{proof.Account, proof.Password, proof.Answer} {
		decoded, err := hex.DecodeString(value)
		if err != nil || len(decoded) != 32 {
			return false
		}
	}
	return true
}

func checkCredentialIntegrity(payload []byte) map[string]bool {
	var input struct {
		Account, Password, Answer string
		Integrity                 *credentialIntegrity
	}
	if json.Unmarshal(payload, &input) != nil || input.Integrity == nil {
		return map[string]bool{"provided": false}
	}
	proof := input.Integrity
	account := strings.TrimSpace(input.Account)
	if strings.HasSuffix(strings.ToLower(account), "@srmist.edu.in") {
		account = account[:len(account)-len("@srmist.edu.in")]
	}
	match := func(field, value, expected string) bool {
		hash := sha256.Sum256([]byte(proof.Nonce + "\n" + field + "\n" + value))
		return subtle.ConstantTimeCompare([]byte(hex.EncodeToString(hash[:])), []byte(expected)) == 1
	}
	return map[string]bool{"provided": true, "account_match": match("account", account, proof.Account), "password_match": match("password", input.Password, proof.Password), "answer_match": match("answer", input.Answer, proof.Answer)}
}
