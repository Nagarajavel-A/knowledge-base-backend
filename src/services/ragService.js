const axios = require("axios");

async function queryRAG(workspaceId, question) {
  const response = await axios.post("http://localhost:8000/query", {
    workspace_id: workspaceId,
    question: question
  });

  return response.data;
}

module.exports = { queryRAG };