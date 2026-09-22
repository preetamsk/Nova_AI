# NOVA frontend

The existing NOVA interface is a Next.js application. It is deployed on Vercel
and calls the separately deployed NOVA API through `NEXT_PUBLIC_API_URL`.

`NEXT_PUBLIC_API_URL` is safe to expose because it is only the backend address.
Do not put OpenAI keys, database URLs, or session secrets in this directory or
in Vercel frontend environment variables.
