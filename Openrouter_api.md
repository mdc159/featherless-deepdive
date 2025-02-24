import requests
import json

response = requests.post(
  url="<https://openrouter.ai/api/v1/chat/completions>",
  headers={
    "Authorization": "Bearer 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",
    "HTTP-Referer": "<YOUR_SITE_URL>", # Optional. Site URL for rankings on openrouter.ai.
    "X-Title": "<YOUR_SITE_NAME>", # Optional. Site title for rankings on openrouter.ai.
  },
  data=json.dumps({
    "model": "openai/o1-mini", # Optional
    "messages": [
      {
        "role": "user",
        "content": "What is the meaning of life?"
      }
    ]
  })
)

print(response.json())
