import { createClient } from '@supabase/supabase-js'
import { codeBlock, oneLine } from 'common-tags'
import GPT3Tokenizer from 'gpt3-tokenizer'
import { CreateCompletionRequest } from 'openai'

export class ApplicationError extends Error {
  constructor(message: string, public data: Record<string, any> = {}) {
    super(message);
  }
}

export default async function (query, openAiKey, supabaseUrl, supabaseServiceKey) {
  if (!openAiKey) {
    throw new ApplicationError('Missing environment variable OPENAI_KEY')
  }

  if (!supabaseUrl) {
    throw new ApplicationError('Missing environment variable SUPABASE_URL')
  }

  if (!supabaseServiceKey) {
    throw new ApplicationError('Missing environment variable SUPABASE_SERVICE_ROLE_KEY')
  }

  if (!query) {
    throw new ApplicationError('Missing query in request data')
  }

  const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

  const sanitizedQuery = query.trim()

  const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-ada-002',
      input: sanitizedQuery.replaceAll('\n', ' '),
    }),
  })

  if (embeddingResponse.status !== 200) {
    throw new ApplicationError('Failed to create embedding for question', embeddingResponse)
  }
  console.log(`提问： ${query}`)
  console.log('embedding ...')
  const {
    data: [{ embedding }],
  } = await embeddingResponse.json()

  console.log('embedding 完成, 开始搜索数据库...')
  const { error: matchError, data: pageSections } = await supabaseClient.rpc(
    'match_page_sections',
    {
      embedding,
      match_threshold: 0.78,
      match_count: 10,
      min_content_length: 50,
    }
  )

  if (matchError) {
    throw new ApplicationError('Failed to match page sections', matchError)
  }
  console.log('搜索完成, 开始请求chatgpt...')

  // @ts-ignore 
  const tokenizer = new GPT3Tokenizer({ type: 'gpt3' })
  let tokenCount = 0
  let contextText = ''

  for (let i = 0; i < pageSections.length; i++) {
    const pageSection = pageSections[i]
    const content = pageSection.content
    const encoded = tokenizer.encode(content)
    tokenCount += encoded.text.length

    if (tokenCount >= 1500) {
      break
    }

    contextText += `${content.trim()}\n---\n`
  }

  const prompt = codeBlock`
    ${oneLine`
      You are a very enthusiastic Supabase representative who loves
      to help people! Given the following sections from the Supabase
      documentation, answer the question using only that information,
      outputted in markdown format. If you are unsure and the answer
      is not explicitly written in the documentation, say
      "Sorry, I don't know how to help with that."
    `}

    Context sections:
    ${contextText}

    Question: """
    ${sanitizedQuery}
    """

    Answer as markdown (including related code snippets if available):
  `

  const completionOptions: CreateCompletionRequest = {
    model: 'text-davinci-003',
    prompt,
    max_tokens: 512,
    temperature: 0,
    stream: true,
  }

  const response = await fetch('https://api.openai.com/v1/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(completionOptions),
  })

  console.log('chatgpt 回复为：', response)

  if (!response.ok) {
    const error = await response.json()
    throw new ApplicationError('Failed to generate completion', error)
  }

  // Proxy the streamed SSE response from OpenAI
  return response
}