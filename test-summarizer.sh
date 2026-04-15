#!/bin/bash
# Test summarizer API

TEXT="${1:-Large language models are complex computer programs trained on vast amounts of text data to understand and generate human language. They use deep learning techniques, specifically transformer architectures, to process and predict text sequences. These models can perform various tasks including translation, summarization, question answering, and creative writing.}"

echo "Testing summarizer on http://127.0.0.1:8106"
echo "Input: $TEXT"
echo ""

curl -s -X POST http://127.0.0.1:8106/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"summarizer\",
    \"messages\": [
      {\"role\": \"system\", \"content\": \"You are a helpful summarizer. Create a concise 1-2 sentence summary.\"},
      {\"role\": \"user\", \"content\": \"Summarize this:\n\n$TEXT\"}
    ],
    \"max_tokens\": 100,
    \"temperature\": 0.3
  }" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Summary:', d['choices'][0]['message']['content'])"
