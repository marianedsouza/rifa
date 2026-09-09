-- Migration: Dados iniciais (seed)
-- Rode DEPOIS da migration 001 no Supabase SQL Editor
-- NOTA: Usuários devem ser criados via Supabase Dashboard > Authentication

-- Configurações padrão da plataforma
INSERT INTO public.settings (key, value) VALUES
  ('platform_name', 'Rifa com Causa'),
  ('pix_key', 'pixinstitutonh@gmail.com'),
  ('pix_type', 'email'),
  ('pix_payee', 'Alessandra Carla Sampaio de Souza'),
  ('pix_bank', 'Inter'),
  ('org_name', 'Instituto Novo Horizonte'),
  ('whatsapp_default', '5511999999999')
ON CONFLICT (key) DO NOTHING;
