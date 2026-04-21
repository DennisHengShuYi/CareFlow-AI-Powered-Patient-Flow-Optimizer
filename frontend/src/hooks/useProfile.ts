import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '../lib/supabase';

export interface Profile {
  id: string;
  full_name: string | null;
  role: 'patient' | 'hospital_staff';
  avatar_url: string | null;
  location: string | null;
  age: number | null;
  gender: string | null;
  updated_at: string;
}

export function useProfile() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    async function fetchProfile() {
      if (!isLoaded) return;
      if (!isSignedIn || !user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const { data, error: supError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (supError) {
          if (supError.code === 'PGRST116') {
            // Profile does not exist yet
            setProfile(null);
          } else {
            console.error('Error fetching profile:', supError);
            setError(supError);
          }
        } else {
          setProfile(data as Profile);
        }
      } catch (err) {
        console.error('Catch error fetching profile:', err);
        setError(err);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [isLoaded, isSignedIn, user?.id]);

  return { profile, loading, error, role: profile?.role };
}
