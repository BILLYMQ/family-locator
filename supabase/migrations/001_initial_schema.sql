-- ============================================================
-- FamilyLocator — Schéma initial
-- À exécuter dans l'éditeur SQL de Supabase (SQL Editor)
-- ============================================================

-- ── 1. TABLE PROFILES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  phone       TEXT,
  full_name   TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Un utilisateur ne peut lire/modifier QUE son propre profil
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Les membres de la famille peuvent voir le profil d'un membre accepté
CREATE POLICY "profiles_select_family" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.family_bonds
      WHERE status = 'accepted'
        AND (
          (parent_id = auth.uid() AND child_id  = profiles.id) OR
          (child_id  = auth.uid() AND parent_id = profiles.id)
        )
    )
  );

-- ── 2. TABLE LOCATIONS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.locations (
  user_id     UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  accuracy    DOUBLE PRECISION,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- Seul l'utilisateur peut écrire SA position
CREATE POLICY "locations_insert_own" ON public.locations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "locations_update_own" ON public.locations
  FOR UPDATE USING (auth.uid() = user_id);

-- RÈGLE RGPD CRITIQUE : on ne peut voir la position d'un autre
-- que si le lien familial est 'accepted'
CREATE POLICY "locations_select_family" ON public.locations
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.family_bonds
      WHERE status = 'accepted'
        AND (
          (parent_id = auth.uid() AND child_id  = locations.user_id) OR
          (child_id  = auth.uid() AND parent_id = locations.user_id)
        )
    )
  );

-- ── 3. TABLE FAMILY_BONDS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.family_bonds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  child_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (parent_id, child_id)
);

ALTER TABLE public.family_bonds ENABLE ROW LEVEL SECURITY;

-- Un utilisateur voit uniquement ses propres liens (en tant que parent ou enfant)
CREATE POLICY "bonds_select_participant" ON public.family_bonds
  FOR SELECT USING (
    auth.uid() = parent_id OR auth.uid() = child_id
  );

-- Seul le parent peut créer une invitation
CREATE POLICY "bonds_insert_parent" ON public.family_bonds
  FOR INSERT WITH CHECK (auth.uid() = parent_id);

-- Seul l'enfant (destinataire) peut accepter/refuser une invitation
CREATE POLICY "bonds_update_child" ON public.family_bonds
  FOR UPDATE USING (auth.uid() = child_id)
  WITH CHECK (status IN ('accepted', 'rejected'));

-- Un participant peut supprimer le lien
CREATE POLICY "bonds_delete_participant" ON public.family_bonds
  FOR DELETE USING (
    auth.uid() = parent_id OR auth.uid() = child_id
  );

-- ── 4. TRIGGER — Création automatique du profil à l'inscription ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 5. REALTIME — Activer les publications temps réel ───────
ALTER PUBLICATION supabase_realtime ADD TABLE public.locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.family_bonds;
