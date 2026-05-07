UPDATE public.users
SET role = 'super_admin', updated_at = NOW()
WHERE email = 'adminimport@example.com';
