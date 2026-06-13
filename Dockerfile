# ── Stage 1 : Build Expo web ───────────────────────────────────────────────
FROM node:18-alpine AS builder
WORKDIR /app

# Dépendances d'abord pour optimiser le cache Docker
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Code source
COPY . .

# Clés Supabase injectées à la compilation (EXPO_PUBLIC_ = exposées au client)
ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY
ENV EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL
ENV EXPO_PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY

# Build SPA → dossier dist/
RUN npx expo export --platform web

# ── Stage 2 : Serveur nginx léger ──────────────────────────────────────────
FROM nginx:1.25-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost/index.html || exit 1

CMD ["nginx", "-g", "daemon off;"]
