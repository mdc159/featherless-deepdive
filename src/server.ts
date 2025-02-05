import express from 'express';
import { deepResearch, writeFinalReport } from './deep-research';
import { generateFeedback } from './feedback';
import { fetchModels } from './ai/providers';

const app = express();
app.use(express.json());

app.post('/api/research', async (req, res) => {
  const { query, breadth, depth, selectedModel, concurrency } = req.body;
  
  res.setHeader('Content-Type', 'text/plain');
  res.flushHeaders();

  const sendUpdate = (message: string) => {
    res.write(message + '\n');
  };

  try {
    const { learnings, visitedUrls } = await deepResearch({
      query,
      breadth,
      depth,
      selectedModel,
      concurrency,
    });

    const report = await writeFinalReport({
      prompt: query,
      learnings,
      visitedUrls,
      selectedModel,
    });

    sendUpdate(`REPORT:${report}`);
  } catch (error) {
    console.error('Research failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendUpdate('ERROR:Research failed - ' + errorMessage);
  } finally {
    res.end();
  }
});

app.post('/api/feedback', async (req, res) => {
  const { query, selectedModel } = req.body;
  
  try {
    const questions = await generateFeedback({ query, selectedModel });
    res.json(questions);
  } catch (error) {
    console.error('Error generating feedback:', error);
    res.status(500).json({ error: 'Failed to generate feedback questions' });
  }
});

app.get('/api/models', async (_req, res) => {
  try {
    const models = await fetchModels();
    res.json(models);
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 