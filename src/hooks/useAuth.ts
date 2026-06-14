import { useState, useEffect } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types/database';

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('rate limit') || m.includes('email rate limit')) {
    return `Trop de tentatives d'inscription ont été faites récemment. Veuillez patienter environ une heure avant de réessayer.`;
  }
  if (m.includes('user already registered') || m.includes('already registered')) {
    return `Un compte existe déjà avec cette adresse email. Essayez de vous connecter.`;
  }
  if (m.includes('email not confirmed')) {
    return `Votre adresse email n'a pas encore été confirmée. Vérifiez votre boîte de réception.`;
  }
  if (m.includes('invalid login credentials')) {
    return `Email ou mot de passe incorrect.`;
  }
  if (m.includes('password should be at least')) {
    return `Le mot de passe doit contenir au moins 6 caractères.`;
  }
  if (m.includes('signup is disabled') || m.includes('signups not allowed')) {
    return `Les inscriptions sont temporairement désactivées. Réessayez plus tard.`;
  }
  return message;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    loading: true,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState(prev => ({ ...prev, session, user: session?.user ?? null }));
      if (session?.user) fetchProfile(session.user.id);
      else setState(prev => ({ ...prev, loading: false }));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setState(prev => ({ ...prev, session, user: session?.user ?? null }));
        if (session?.user) fetchProfile(session.user.id);
        else setState(prev => ({ ...prev, profile: null, loading: false }));
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setState(prev => ({ ...prev, profile: data ?? null, loading: false }));
  }

  async function signUp(email: string, password: string, fullName: string, phone?: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, ...(phone ? { phone } : {}) } },
    });
    // Écriture directe dans profiles avec l'ID retourné (fonctionne même si la session
    // n'est pas encore active, ex. : confirmation email requise).
    if (!error && data.user?.id && phone) {
      await supabase.from('profiles').update({ phone }).eq('id', data.user.id);
    }
    return { error: error ? new Error(translateAuthError(error.message)) : null };
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function updateProfile(updates: Partial<Pick<Profile, 'full_name' | 'phone' | 'avatar_url'>>) {
    if (!state.user) return { error: new Error('Non connecté') };
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', state.user.id)
      .select()
      .single();
    if (data) setState(prev => ({ ...prev, profile: data }));
    return { error };
  }

  return { ...state, signUp, signIn, signOut, updateProfile };
}
