# --- Estágio 1: Builder ---
# Usamos uma imagem Node.js para construir o projeto.
# 'slim' é uma versão menor, ideal para builds.
FROM node:20-slim AS builder

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de dependências primeiro para aproveitar o cache do Docker
COPY package*.json ./

# Instala todas as dependências, incluindo as de desenvolvimento (como typescript e tsx)
RUN npm install

# Copia o resto do código-fonte do projeto
COPY . .

# Compila o TypeScript para JavaScript. O resultado irá para a pasta /dist
RUN npm run build

# --- Estágio 2: Production ---
# Começamos com uma nova imagem limpa para o ambiente de produção.
FROM node:20-slim

WORKDIR /app

# Copia os arquivos de dependências novamente
COPY package*.json ./

# Instala SOMENTE as dependências de produção, resultando em uma imagem menor
RUN npm install --production

# Copia o código JavaScript compilado do estágio 'builder'
COPY --from=builder /app/dist ./dist

# Expõe a porta que a sua aplicação usa (definida em process.env.API_PORT ou 3000)
EXPOSE 3000

# O comando para iniciar a aplicação quando o container for executado
CMD [ "node", "dist/app.js" ]
