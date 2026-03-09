import axios from "axios";

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || "http://localhost:8000";

export async function ask(req, res) {
  try {
    const { workspaceId, question } = req.body;

    if (!workspaceId || !question) {
      return res.status(400).json({
        message: "workspaceId and question are required"
      });
    }

    if (question.length > 500) {
      return res.status(400).json({
        message: "Question too long"
      });
    }

    const response = await axios.post(`${RAG_SERVICE_URL}/query`, {
      workspace_id: workspaceId,
      question: question
    });

    return res.json(response.data);

  } catch (error) {

    console.error("RAG Error:", error?.response?.data || error.message);

    return res.status(500).json({
      message: "RAG query failed"
    });
  }
}