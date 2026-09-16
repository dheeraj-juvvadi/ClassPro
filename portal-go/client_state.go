package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/publicsuffix"
)

type storedCookie struct {
	Source string
	Cookie http.Cookie
}

type transientJar struct {
	http.CookieJar
	mu    sync.Mutex
	items map[string]storedCookie
}

func restoreJar(items []storedCookie) *transientJar {
	jar, _ := cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})
	result := &transientJar{CookieJar: jar, items: make(map[string]storedCookie)}
	for _, item := range items {
		address, err := url.Parse(item.Source)
		if err == nil {
			result.SetCookies(address, []*http.Cookie{&item.Cookie})
		}
	}
	return result
}

func (jar *transientJar) SetCookies(address *url.URL, cookies []*http.Cookie) {
	jar.mu.Lock()
	defer jar.mu.Unlock()
	jar.CookieJar.SetCookies(address, cookies)
	for _, cookie := range cookies {
		copy := *cookie
		if copy.Path == "" || !strings.HasPrefix(copy.Path, "/") {
			copy.Path = address.EscapedPath()
			if index := strings.LastIndex(copy.Path, "/"); index > 0 {
				copy.Path = copy.Path[:index]
			} else {
				copy.Path = "/"
			}
		}
		if copy.MaxAge > 0 {
			copy.Expires = time.Now().Add(time.Duration(copy.MaxAge) * time.Second)
			copy.MaxAge = 0
		}
		domain := copy.Domain
		if domain == "" {
			domain = address.Hostname()
		}
		key := domain + "|" + copy.Path + "|" + copy.Name
		if copy.MaxAge < 0 || (!copy.Expires.IsZero() && time.Now().After(copy.Expires)) {
			delete(jar.items, key)
			continue
		}
		jar.items[key] = storedCookie{Source: address.Scheme + "://" + address.Host + copy.Path, Cookie: copy}
	}
}

func (jar *transientJar) snapshot() []storedCookie {
	jar.mu.Lock()
	defer jar.mu.Unlock()
	items := []storedCookie{}
	for _, item := range jar.items {
		if item.Cookie.Expires.IsZero() || time.Now().Before(item.Cookie.Expires) {
			items = append(items, item)
		}
	}
	return items
}

type clientState struct {
	Provider                                                string
	Expires                                                 int64
	Authenticated                                           bool
	Remember                                                bool
	Cookies                                                 []storedCookie
	Fields                                                  url.Values
	Nonce, DomainField, InteractionField, Delimiter, Digest string
	Loaded                                                  time.Time
}

type stateCodec struct {
	cipher   cipher.AEAD
	secure   bool
	audience string
}

func newStateCodec(key, audience string, secure bool) (*stateCodec, error) {
	decoded, err := base64.StdEncoding.DecodeString(key)
	if err != nil || len(decoded) != 32 {
		return nil, errors.New("SESSION_ENCRYPTION_KEY must be 32 random bytes encoded as base64")
	}
	block, err := aes.NewCipher(decoded)
	if err != nil {
		return nil, err
	}
	sealed, err := cipher.NewGCM(block)
	return &stateCodec{sealed, secure, audience}, err
}

func (codec *stateCodec) name(index int) string {
	prefix := "classpro_state_"
	if codec.secure {
		prefix = "__Host-classpro_state_"
	}
	return prefix + strconv.Itoa(index)
}

func (codec *stateCodec) read(request *http.Request) (*clientState, error) {
	var encoded strings.Builder
	for index := 0; index < 3; index++ {
		cookie, err := request.Cookie(codec.name(index))
		if err != nil {
			break
		}
		if len(cookie.Value) > 3000 {
			return nil, errors.New("invalid session")
		}
		encoded.WriteString(cookie.Value)
	}
	data, err := base64.RawURLEncoding.DecodeString(encoded.String())
	if err != nil || len(data) < codec.cipher.NonceSize() {
		return nil, errors.New("missing session")
	}
	nonce := data[:codec.cipher.NonceSize()]
	plain, err := codec.cipher.Open(nil, nonce, data[len(nonce):], []byte(codec.audience))
	if err != nil {
		return nil, errors.New("invalid session")
	}
	var state clientState
	if json.Unmarshal(plain, &state) != nil || state.Expires <= time.Now().Unix() || (state.Provider != "portal" && state.Provider != "academia") {
		return nil, errors.New("expired session")
	}
	return &state, nil
}

func (codec *stateCodec) write(writer http.ResponseWriter, state *clientState) error {
	plain, err := json.Marshal(state)
	if err != nil {
		return err
	}
	nonce := make([]byte, codec.cipher.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return err
	}
	encoded := base64.RawURLEncoding.EncodeToString(codec.cipher.Seal(nonce, nonce, plain, []byte(codec.audience)))
	if len(encoded) > 9000 {
		return errors.New("session exceeds browser cookie capacity")
	}
	for index := 0; index < 3; index++ {
		cookie := &http.Cookie{Name: codec.name(index), Path: "/", HttpOnly: true, Secure: codec.secure, SameSite: http.SameSiteStrictMode, MaxAge: -1}
		start := index * 3000
		if start < len(encoded) {
			cookie.Value = encoded[start:min(start+3000, len(encoded))]
			cookie.MaxAge = 0
			if state.Remember || !state.Authenticated {
				cookie.MaxAge = max(1, int(state.Expires-time.Now().Unix()))
			}
		}
		http.SetCookie(writer, cookie)
	}
	return nil
}

func (codec *stateCodec) clear(writer http.ResponseWriter) {
	for index := 0; index < 3; index++ {
		http.SetCookie(writer, &http.Cookie{Name: codec.name(index), Path: "/", HttpOnly: true, Secure: codec.secure, SameSite: http.SameSiteStrictMode, MaxAge: -1})
	}
}
