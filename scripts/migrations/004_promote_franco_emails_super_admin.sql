UPDATE public.users
SET role = 'super_admin', is_active = TRUE, updated_at = NOW()
WHERE email IN ('francocb79@gmail.com', 'francocb79@yahoo.com');

SELECT email, role, is_active
FROM public.users
WHERE email IN ('francocb79@gmail.com', 'francocb79@yahoo.com')
ORDER BY email;
