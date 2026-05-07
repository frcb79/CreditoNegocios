UPDATE public.users
SET role = 'super_admin', updated_at = NOW(), is_active = TRUE
WHERE email = 'francocb79@gmail.com';

SELECT id, email, role, is_active
FROM public.users
WHERE email = 'francocb79@gmail.com';
