import type { LayoutServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');
  
  const { data: me } = await locals.supabase
    .from('users')
    .select('role')
    .eq('id', session.user.id)
    .single();
    
  if (!me || me.role !== 'admin') throw error(403, 'Forbidden');

  return {
    user: session.user,
    userRole: me.role
  };
};
