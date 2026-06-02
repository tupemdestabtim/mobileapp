const sequelize = require('./database');
const Warga = require('../models/Warga');
const User = require('../models/User');
const Dusun = require('../models/Dusun');

async function seedWarga() {
  try {
    await sequelize.authenticate();
    console.log('Database connected for seeding.');

    // Ensure Dusun exist
    const dusuns = [
      { id: 1, nama_dusun: 'Dusun 1' },
      { id: 2, nama_dusun: 'Dusun 2' },
      { id: 3, nama_dusun: 'Dusun 3' }
    ];

    for (const d of dusuns) {
      await Dusun.findOrCreate({ where: { id: d.id }, defaults: d });
    }

    // Petugas Data
    const petugasList = [
      { id: 3, nama_lengkap: 'Nur Iman Adam', username: 'iman', role: 'petugas', dusun_id: 1 },
      { id: 4, nama_lengkap: 'Arwin Adam', username: 'arwin', role: 'petugas', dusun_id: 2 },
      { id: 5, nama_lengkap: 'Kahiruddin', username: 'uha', role: 'petugas', dusun_id: 3 }
    ];

    for (const p of petugasList) {
      await User.findOrCreate({ 
        where: { id: p.id }, 
        defaults: { ...p, password: 'password123' } 
      });
    }

    const firstNames = ['Budi', 'Siti', 'Andi', 'Agus', 'Lani', 'Dewi', 'Eko', 'Rina', 'Joko', 'Maya', 'Heri', 'Ani', 'Dani', 'Tati', 'Rudi'];
    const lastNames = ['Santoso', 'Pratama', 'Wulandari', 'Kusuma', 'Hidayat', 'Saputra', 'Lestari', 'Wijaya', 'Sari', 'Mulyono'];
    const placeOfBirth = ['Jakarta', 'Bandung', 'Surabaya', 'Makassar', 'Gorontalo', 'Manado', 'Medan'];
    const occupations = ['Petani', 'Pedagang', 'Buruh', 'PNS', 'Guru', 'Wiraswasta', 'IRT'];

    for (const p of petugasList) {
      console.log(`Seeding data for ${p.nama_lengkap} (Dusun ${p.dusun_id})...`);
      
      const wargaInDusun = [];
      const kkList = [];
      
      // Generate 5 KK for each dusun
      for (let k = 1; k <= 5; k++) {
        kkList.push(`750101${p.dusun_id}${k.toString().padStart(9, '0')}`);
      }

      // Generate 30 Warga for each dusun
      for (let i = 1; i <= 30; i++) {
        const isMale = Math.random() > 0.5;
        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        const fullName = `${firstName} ${lastName} ${i}`;
        
        const birthYear = 1960 + Math.floor(Math.random() * 60);
        const birthMonth = 1 + Math.floor(Math.random() * 12);
        const birthDay = 1 + Math.floor(Math.random() * 28);
        const birthDate = `${birthYear}-${birthMonth.toString().padStart(2, '0')}-${birthDay.toString().padStart(2, '0')}`;
        
        const today = new Date();
        let age = today.getFullYear() - birthYear;
        if (today.getMonth() + 1 < birthMonth || (today.getMonth() + 1 === birthMonth && today.getDate() < birthDay)) {
          age--;
        }

        const randomKK = kkList[Math.floor(Math.random() * kkList.length)];

        wargaInDusun.push({
          nik: `750101${p.dusun_id}${i.toString().padStart(9, '0')}`,
          no_kk: randomKK,
          nama_lengkap: fullName,
          tempat_lahir: placeOfBirth[Math.floor(Math.random() * placeOfBirth.length)],
          tanggal_lahir: birthDate,
          umur: age,
          jenis_kelamin: isMale ? 'L' : 'P',
          agama: 'islam',
          pendidikan_terakhir: 'sma',
          pekerjaan_utama: occupations[Math.floor(Math.random() * occupations.length)],
          status_perkawinan: age > 20 ? 'kawin' : 'belum_kawin',
          alamat_lengkap: `Jl. Poros Dusun ${p.dusun_id} No. ${i}`,
          dusun_id: p.dusun_id,
          created_by: p.id,

          // Sanitasi
          sumber_air_minum: 'kemasan',
          kualitas_air_minum: 'baik',
          fasilitas_bab: 'sendiri',
          jenis_kloset: 'leher_angsa',
          pembuangan_akhir_tinja: 'septic_tank',
          pengelolaan_sampah: 'tps',

          // Kesehatan
          jaminan_kesehatan: 'bpjs_pbi',
          riwayat_penyakit_kronis: JSON.stringify(['tidak_ada']),
          status_disabilitas: 'tidak_ada',
          frekuensi_makan: 3,
          fasilitas_kesehatan_rutin: 'puskesmas',
          kelompok_rentan: JSON.stringify(['tidak_ada']),

          // Aset
          status_kepemilikan_rumah: 'milik_sendiri',
          luas_lantai: 36 + Math.floor(Math.random() * 100),
          jenis_lantai: 'keramik',
          jenis_dinding: 'tembok',
          jenis_atap: 'genteng',
          sumber_penerangan: 'pln_meteran',
          bahan_bakar_memasak: 'lpg',
          aset_kendaraan: JSON.stringify(['motor']),
          aset_elektronik: JSON.stringify(['smartphone', 'tv'])
        });
      }

      await Warga.bulkCreate(wargaInDusun, { ignoreDuplicates: true });
    }

    console.log('Seeding completed successfully (90 citizens total).');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

seedWarga();
