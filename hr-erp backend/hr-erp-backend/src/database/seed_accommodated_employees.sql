-- Szállásolt munkavállalók hozzáadása a seed-hez

-- Előfeltétel: tenant1Id és roles.accommodated_employee értékek ismertek

-- Szállásolt munkavállalók (Accommodated Employees)
INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, phone, is_active)
VALUES 
  -- ABC Kft. szállásolt munkavállalók
  (tenant1Id, 'horvath.gabor@employee.com', passwordHash, 'Horváth', 'Gábor', '+36 30 123 4567', true),
  (tenant1Id, 'molnar.zsuzsanna@employee.com', passwordHash, 'Molnár', 'Zsuzsanna', '+36 30 234 5678', true),
  (tenant1Id, 'varga.istvan@employee.com', passwordHash, 'Varga', 'István', '+36 30 345 6789', true),
  (tenant1Id, 'farkas.katalin@employee.com', passwordHash, 'Farkas', 'Katalin', '+36 30 456 7890', true)
RETURNING id, email;

-- Szerepkör hozzárendelés (accommodated_employee)
-- A visszakapott ID-kkal:
INSERT INTO user_roles (user_id, role_id, tenant_id)
VALUES 
  (horvathGaborId, accommodatedEmployeeRoleId, tenant1Id),
  (molnarZsuzsannaId, accommodatedEmployeeRoleId, tenant1Id),
  (vargaIstvanId, accommodatedEmployeeRoleId, tenant1Id),
  (farkasKatalinId, accommodatedEmployeeRoleId, tenant1Id);
