# FamilyLocator

Application de localisation familiale en temps réel, construite avec Expo et Supabase.

> **Consentement obligatoire** — La position GPS d'un membre ne devient visible qu'après acceptation explicite de son invitation. Aucun suivi ne se fait à l'insu de la personne.

---

## Description

FamilyLocator permet à une famille de partager sa position en temps réel sur une carte interactive. Chaque membre contrôle son propre partage : il peut l'activer, le désactiver, ou quitter le groupe à tout moment. L'invitation par email ou par numéro de téléphone sert uniquement à retrouver un compte existant — elle ne permet jamais de localiser quelqu'un sans son accord.

---

## Technologies

| Couche | Outil |
|--------|-------|
| Framework mobile | Expo SDK 51 / React Native 0.74 |
| Framework web | React Native Web (Metro bundler) |
| Langage | TypeScript |
| Styles | NativeWind v4 (Tailwind CSS) |
| Backend / Auth | Supabase (PostgreSQL + Auth + Realtime) |
| Carte web | Leaflet 1.9 (vanilla, sans react-leaflet) |
| Carte mobile | `expo-location` + carte native |
| Navigation | React Navigation v6 |
| Notifications | `expo-notifications` |

---

## Fonctionnalités

- Authentification par email / mot de passe
- Carte interactive avec position de chaque membre de la famille
- Partage de position temps réel via Supabase Realtime
- Invitation par email ou numéro de téléphone
- Système de consentement : invitation → acceptation → partage activé
- Possibilité d'annuler une invitation envoyée
- Possibilité de retirer un membre de la famille
- Toggle partage de position depuis l'écran Profil
- Interface web responsive (desktop + mobile browser)
- Interface mobile native (iOS / Android via Expo)

---

## Installation

### Prérequis

- Node.js 18+
- npm ou yarn
- Expo CLI (`npm install -g expo-cli`)
- Un projet Supabase (voir section ci-dessous)

### Cloner et installer

```bash
git clone https://github.com/VOTRE_NOM/family-locator.git
cd family-locator
npm install
```

### Configurer les variables d'environnement

```bash
cp .env.example .env
```

Éditez `.env` et remplissez vos valeurs Supabase :

```env
EXPO_PUBLIC_SUPABASE_URL=https://VOTRE_PROJECT_ID.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=VOTRE_ANON_KEY
```

---

## Lancement

### Web

```bash
npx expo start --web
```

Ouvrir [http://localhost:8081](http://localhost:8081) dans le navigateur.

### Mobile (Expo Go)

```bash
npx expo start
```

Scanner le QR code avec l'application **Expo Go** (iOS ou Android).

### iOS / Android (build natif)

```bash
npx expo run:ios
npx expo run:android
```

---

## Configuration Supabase

### 1. Créer un projet Supabase

Sur [supabase.com](https://supabase.com), créez un nouveau projet et copiez l'URL et la clé `anon` dans votre `.env`.

### 2. Créer les tables

Exécutez les migrations SQL suivantes dans l'éditeur SQL de votre projet Supabase :

```sql
-- Profils utilisateurs (synchronisés avec auth.users via trigger)
CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email       text,
  phone       text,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz DEFAULT now()
);

-- Positions GPS
CREATE TABLE public.locations (
  user_id    uuid PRIMARY KEY REFERENCES public.profiles ON DELETE CASCADE,
  latitude   double precision NOT NULL,
  longitude  double precision NOT NULL,
  accuracy   double precision,
  updated_at timestamptz DEFAULT now()
);

-- Liens familiaux (invitations + membres acceptés)
CREATE TABLE public.family_bonds (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id  uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  child_id   uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at timestamptz DEFAULT now()
);
```

### 3. Activer Row Level Security (RLS)

```sql
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_bonds ENABLE ROW LEVEL SECURITY;
```

### 4. Créer le trigger de synchronisation profil

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 5. Créer les fonctions RPC (SECURITY DEFINER)

Ces fonctions permettent de rechercher un profil par email ou téléphone sans exposer les données via RLS :

```sql
CREATE OR REPLACE FUNCTION public.search_profile_by_email(p_email text)
RETURNS TABLE(id uuid, full_name text) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  p_email := lower(trim(p_email));
  RETURN QUERY
    SELECT p.id, p.full_name
    FROM public.profiles p
    WHERE lower(p.email) = p_email
    LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_profile_by_phone(p_phone text)
RETURNS TABLE(id uuid, full_name text) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  p_phone := regexp_replace(p_phone, '[\s\(\)\-\.]', '', 'g');
  IF length(p_phone) < 8 THEN RETURN; END IF;
  RETURN QUERY
    SELECT p.id, p.full_name
    FROM public.profiles p
    WHERE p.phone = p_phone
    LIMIT 1;
END;
$$;
```

### 6. Activer Realtime

Dans le tableau de bord Supabase → **Database → Replication**, activez Realtime sur la table `family_bonds` et `locations`.

---

## Structure du projet

```
src/
├── hooks/
│   ├── useAuth.ts              # Authentification Supabase
│   ├── useFamily.ts            # Membres, invitations, liens familiaux
│   ├── useLocation.ts          # Géolocalisation (natif)
│   ├── useLocation.web.ts      # Géolocalisation (web)
│   └── useNotifications.ts     # Notifications push
├── lib/
│   └── supabase.ts             # Client Supabase (lit les variables .env)
├── navigation/
│   └── AppNavigator.tsx        # Stack Auth + Tabs App
├── screens/
│   ├── auth/                   # LoginScreen, RegisterScreen (.tsx + .web.tsx)
│   ├── family/                 # FamilyScreen (.tsx + .web.tsx)
│   ├── map/                    # MapScreen (.tsx + .web.tsx)
│   └── profile/                # ProfileScreen (.tsx + .web.tsx)
└── types/
    └── database.ts             # Types TypeScript générés depuis le schéma Supabase
```

Les fichiers `.web.tsx` sont résolus automatiquement par Metro sur la plateforme web.

---

## Sécurité et vie privée

- La localisation n'est **jamais partagée sans consentement** — un lien familial doit être accepté avant tout partage.
- Les clés Supabase dans `.env` sont la clé **anon** (publique par conception) protégée par les politiques RLS.
- Ne committez **jamais** votre fichier `.env` — il est dans `.gitignore`.
- La clé **service_role** de Supabase ne doit jamais apparaître dans le code client.

---

## Licence

MIT
