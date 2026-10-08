FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* .npmrc ./
RUN npm ci
COPY . .
ARG PUBLIC_SITE_URL=https://example.com
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL
ARG PUBLIC_WALINE_SERVER_URL
ENV PUBLIC_WALINE_SERVER_URL=$PUBLIC_WALINE_SERVER_URL
RUN npm run build

FROM node:24-alpine AS admin
WORKDIR /app
COPY package.json package-lock.json* .npmrc ./
RUN npm ci
COPY . .
ENV BLOG_ROOT=/app
EXPOSE 4322
CMD ["npm", "run", "admin"]

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY docker/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
