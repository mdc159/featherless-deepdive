# LLM Integration Plan: Openrouter API & Ollama

This document outlines the steps needed to add two new LLM providers to the codebase:

1. **Integrate Openrouter API to call the "openai/o1-mini" model.**  


2. **Add support for local LLMs via Ollama.**

Both providers should use a similar interface as the existing providers (e.g., DeepSeek, GPT-4 variants) so that they can be selected in the model chooser and invoked via the research flow.
---

## Prerequisites
Make sure you have valid credentials and access:

---