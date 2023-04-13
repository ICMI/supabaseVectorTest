import search from './index.js'
import dotenv from 'dotenv'
// .env 文件
dotenv.config()


const openAiKey = process.env.OPENAI_KEY
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY


const query = (question) => {
  search(question, openAiKey, supabaseUrl, supabaseServiceKey )
}



// 在这里提问
query('请问如何使用F2绘制柱状图？')