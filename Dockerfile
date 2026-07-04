# Etapa 1: Build da aplicação
FROM node:20-alpine AS builder

ARG NEXT_PUBLIC_VERSAO_PLATAFORMA
ARG NEXT_PUBLIC_API_BASE_URL=https://api.lumina.acerola.dev.br
ENV NEXT_PUBLIC_VERSAO_PLATAFORMA=$NEXT_PUBLIC_VERSAO_PLATAFORMA
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

# Diretório de trabalho
WORKDIR /app

# Copia arquivos de dependência
COPY package*.json ./

# Instala todas dependências (dev + prod) apenas para build
RUN npm install

# Copia o restante da aplicação
COPY . .

# Faz o build da aplicação Next.js
RUN npm run build

# Etapa 2: Imagem final para rodar a aplicação
FROM node:20-alpine AS runner

WORKDIR /app

# Copia apenas os arquivos necessários da build
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

# Instala somente dependências de produção
RUN npm install --omit=dev

# Expondo a porta que a aplicação vai rodar
EXPOSE 3000

# Comando para rodar a aplicação
CMD ["npx", "pm2-runtime", "npm", "--name", "app", "--", "start"]
