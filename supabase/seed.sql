insert into public.reports (
  id, title, description, category, location, area, priority, score, status,
  reported_at, department, reporter, image_url, duplicate_of, history
) values
(
  'CP-1001', 'Streetlight out near Hasan Square',
  'The streetlight has been out for three nights and the corner is very dark for people walking home.',
  'Streetlight', 'University Road near Hasan Square', 'Gulshan-e-Iqbal, Karachi, Sindh', 'High', 88, 'Submitted',
  now() - interval '35 minutes', 'Municipal Services', 'Resident',
  'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=240&q=75', null,
  jsonb_build_array(jsonb_build_object('status', 'Submitted', 'time', (extract(epoch from now()) * 1000)::bigint, 'note', 'Report received'))
),
(
  'CP-1002', 'Pothole beside the Saddar school crossing',
  'A deep pothole is forcing drivers to swerve near the school crossing.',
  'Road damage', 'M.A. Jinnah Road near Saddar', 'Saddar, Karachi, Sindh', 'High', 81, 'In progress',
  now() - interval '3 hours', 'Roads & Transport', 'Resident',
  'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=240&q=75', null,
  jsonb_build_array(jsonb_build_object('status', 'Submitted', 'time', (extract(epoch from now() - interval '3 hours') * 1000)::bigint, 'note', 'Report received'), jsonb_build_object('status', 'In progress', 'time', (extract(epoch from now()) * 1000)::bigint, 'note', 'Assigned to Roads & Transport'))
),
(
  'CP-1003', 'Overflowing public bin near Clifton',
  'Waste is spilling onto the sidewalk beside the bus stop.',
  'Waste', 'Clifton bus stop near Boat Basin', 'Clifton, Karachi, Sindh', 'Medium', 63, 'Submitted',
  now() - interval '5 hours', 'Solid Waste Management', 'Resident',
  'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=240&q=75', null,
  jsonb_build_array(jsonb_build_object('status', 'Submitted', 'time', (extract(epoch from now()) * 1000)::bigint, 'note', 'Report received'))
),
(
  'CP-1004', 'Streetlight flickering near Hasan Square',
  'The lamp at Cedar and 8th flickers and goes dark for long stretches each evening.',
  'Streetlight', 'University Road near Hasan Square', 'Gulshan-e-Iqbal, Karachi, Sindh', 'High', 78, 'Submitted',
  now() - interval '11 hours', 'Municipal Services', 'Resident',
  'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=240&q=75', 'CP-1001',
  jsonb_build_array(jsonb_build_object('status', 'Submitted', 'time', (extract(epoch from now()) * 1000)::bigint, 'note', 'Possible duplicate of CP-1001'))
)
on conflict (id) do nothing;
