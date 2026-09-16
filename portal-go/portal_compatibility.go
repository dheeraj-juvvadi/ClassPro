package main

import (
	"fmt"
	"math/rand/v2"
	"time"
)

const portalCompatibilityAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

func portalCompatibilityTelemetry() map[string]any {
	now := time.Now().UnixMilli()
	duration := int64(3000 + rand.IntN(5001))
	return map[string]any{
		"startTime": now - duration, "submitTime": now, "timeOnPageMs": duration,
		"currentDomain": "sp.srmist.edu.in", "timezoneOffset": -330,
		"screenWidth": 1366, "screenHeight": 768, "colorDepth": 24,
		"devicePixelRatio": 1, "platform": "Linux x86_64",
		"userAgent": portalCompatibilityAgent, "language": "en-US",
		"hardwareConcurrency": 8, "deviceMemory": 8, "touchSupport": false,
		"webdriver": false, "mouseClicks": 2 + rand.IntN(5),
		"mouseMovements": 5 + rand.IntN(16), "keystrokeCount": 0,
		"typingSpeedMs": 0, "canvasHash": fmt.Sprintf("%06x", rand.Uint32()&0x7fffffff),
	}
}
