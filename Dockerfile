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

# Port par défaut — Railway injecte $PORT et remplace cette valeur
ENV PORT=8080

# nginx:alpine traite automatiquement /etc/nginx/templates/*.template
# via envsubst au démarrage → résultat dans /etc/nginx/conf.d/
COPY nginx.conf /etc/nginx/templates/default.conf.template

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
