-- Vérifier si l'utilisateur enseignant existe dans la base
-- Exécuter dans Supabase Dashboard → SQL Editor

SELECT id, email, role, created_at
FROM users
WHERE email = 'cherubindavid@gmail.com';

-- Si l'utilisateur n'existe PAS, exécutez:
-- (Décommentez les lignes ci-dessous)

/*
INSERT INTO users (email, role, created_at, updated_at)
VALUES ('cherubindavid@gmail.com', 'teacher', NOW(), NOW())
ON CONFLICT (email) DO UPDATE
SET role = 'teacher', updated_at = NOW();
*/

-- Vérifier après insertion:
SELECT id, email, role, created_at
FROM users
WHERE email = 'cherubindavid@gmail.com';
