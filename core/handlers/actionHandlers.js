// =================================================================
// ACTION HANDLERS
// Logika untuk aksi bot: panen, tanam, booster, dan siklus batch.
// =================================================================

import { logger } from '../../utils/logger.js';
import { api, CaptchaError, SignatureError } from '../../services/api.js';
import { BATCH_SETTINGS } from '../../config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function inventoryCount(state, key) {
    const item = (state?.items || []).find(i => i.key === key);
    return item?.quantity || 0;
}

// [FIXED] Fungsi ini sekarang lebih tangguh terhadap race condition
async function purchaseItemIfNeeded(bot, itemType, quantityNeeded = 1) {
    const isSeed = itemType === 'seed';
    const lock = isSeed ? 'isBuyingSeed' : 'isBuyingBooster';
    const key = isSeed ? bot.config.seedKey : bot.config.boosterKey;
    const buyQty = isSeed ? Math.max(bot.config.seedBuyQty, quantityNeeded) : Math.max(bot.config.boosterBuyQty, quantityNeeded);

    if (bot[lock]) {
        logger.debug(`Pembelian ${itemType} sudah berjalan, proses ini menunggu...`);
        while (bot[lock]) {
            await sleep(500);
        }
        // [RACE CONDITION FIX] Periksa lagi setelah menunggu
        const { state: newState } = await api.getState();
        if (inventoryCount(newState, key) >= quantityNeeded) {
            logger.debug(`Stok ${itemType} sudah dibeli oleh proses lain, pembelian dibatalkan.`);
            return;
        }
    }

    try {
        bot[lock] = true;

        const { state } = await api.getState();
        if (inventoryCount(state, key) < quantityNeeded) {
            logger.warn(`${isSeed ? 'Bibit' : 'Booster'} ${key} habis/kurang. Membeli ${buyQty}...`);
            const buyResult = await api.buyItem(key, buyQty);
            if (!buyResult.ok) {
                // Jangan lempar error agar tidak menghentikan bot total, cukup log
                logger.error(`Gagal membeli ${itemType}: ${buyResult.error?.message || 'Unknown error'}`);
                return; // Keluar jika pembelian gagal
            }
            logger.success(`Berhasil membeli ${itemType}.`);
        } else {
            logger.debug(`Stok ${itemType} sudah ada, pembelian dibatalkan.`);
        }
    } finally {
        bot[lock] = false;
    }
}


export async function handleBatchCycle(bot, initialState = null) {
    if (!bot.isRunning || bot.isPausedForCaptcha || bot.isPausedForSignature || bot.isBatchCycleRunning) return;

    bot.isBatchCycleRunning = true;
    logger.info('Memulai siklus batch...');

    try {
        const state = initialState || (await api.getState()).state;
        if (!state) throw new Error('Gagal mendapatkan state untuk batch cycle.');

        const now = Date.now();
        const plots = state.plots.filter(p => bot.config.slots.includes(p.slotIndex));

        // 1. Panen
        const readyToHarvest = plots.filter(p => p.seed && new Date(p.seed.endsAt).getTime() <= now);
        if (readyToHarvest.length > 0) {
            logger.action('harvest', `Memanen ${readyToHarvest.length} slot secara massal...`);
            const harvestResult = await api.harvestMultiple(readyToHarvest.map(p => p.slotIndex));
            if (harvestResult.ok) {
                const totalCoins = harvestResult.data.plotResults.reduce((sum, p) => sum + (p.coinsEarned || 0), 0);
                const totalAp = harvestResult.data.plotResults.reduce((sum, p) => sum + (p.apEarned || 0), 0);
                logger.success(`Panen massal berhasil: +${Math.round(totalCoins)} koin, +${Math.round(totalAp)} AP.`);
            } else {
                logger.error(`Gagal panen massal: ${harvestResult.error?.message}`);
            }
            await sleep(500);
        }

        // Ambil state terbaru setelah panen
        const stateAfterHarvest = (await api.getState()).state;
        const plotsAfterHarvest = stateAfterHarvest.plots.filter(p => bot.config.slots.includes(p.slotIndex));

        // 2. Tanam
        const emptySlots = plotsAfterHarvest.filter(p => !p.seed);
        if (emptySlots.length > 0) {
            await purchaseItemIfNeeded(bot, 'seed', emptySlots.length);
            logger.action('plant', `Menanam di ${emptySlots.length} slot secara massal...`);
            const plantings = emptySlots.map(p => ({ slotIndex: p.slotIndex, seedKey: bot.config.seedKey }));
            const plantResult = await api.plantMultiple(plantings);
            if (plantResult.ok) {
                logger.success(`Berhasil menanam di ${plantResult.data.plantedSeeds || 0} slot.`);
            } else {
                logger.error(`Gagal tanam massal: ${plantResult.error?.message}`);
            }
            await sleep(500);
        }

        // Ambil state terbaru setelah tanam
        const stateAfterPlanting = (await api.getState()).state;

        // 3. Pasang Booster
        if (bot.config.boosterKey) {
            const needsBooster = stateAfterPlanting.plots.filter(p =>
                bot.config.slots.includes(p.slotIndex) && p.seed && !p.modifier
            );

            if (needsBooster.length > 0) {
                logger.info(`Memasang booster di ${needsBooster.length} slot...`);
                await purchaseItemIfNeeded(bot, 'booster', needsBooster.length);
                for (const slot of needsBooster) {
                    await handleBoosterApplication(bot, slot.slotIndex);
                    await sleep(500); // Jeda antar pemasangan booster
                }
            }
        }

    } catch (error) {
        if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
        if (error instanceof SignatureError) return bot.handleSignatureError();
        logger.error(`Terjadi error pada siklus batch: ${error.message}`);
    } finally {
        bot.isBatchCycleRunning = false;
        bot.refreshAllTimers();
    }
}

// file: core/handlers/actionHandlers.js

export async function handleHarvest(bot, slotIndex) {
    if (!bot.isRunning || bot.isPausedForCaptcha || bot.isPausedForSignature) return;
    bot.plantTimers.delete(slotIndex);

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            logger.action('harvest', `Memanen slot ${slotIndex}...`);
            const result = await api.harvestSlot(slotIndex);
            if (result.ok) {
                const earnings = result.data.plotResults[0];
                const coins = Math.round(earnings.coinsEarned || 0);
                const ap = Math.round(earnings.apEarned || 0);
                const xp = Math.round(earnings.xpGained || 0);
                logger.success(`Slot ${slotIndex} dipanen: +${coins} koin, +${ap} AP, +${xp} XP.`);

                // Setelah panen, langsung coba tanam kembali tanpa memicu refresh global
                await sleep(500); // beri waktu server memperbarui state
                await handlePlanting(bot, slotIndex);

                return; // Sukses, keluar dari loop
            }
            throw new Error(result.error?.message || 'Unknown harvest error');
        } catch (error) {
            if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
            if (error instanceof SignatureError) return bot.handleSignatureError();
            logger.error(`Gagal memanen slot ${slotIndex}: ${error.message}. Mencoba lagi... (${attempt}/3)`);
            if (attempt < 3) await sleep(5000);
            else logger.error(`Gagal total memanen slot ${slotIndex} setelah 3 percobaan.`);
        }
    }
}

export async function handlePlanting(bot, slotIndex) {
    if (!bot.isRunning || bot.isPausedForCaptcha || bot.isPausedForSignature) return;

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await purchaseItemIfNeeded(bot, 'seed');
            logger.action('plant', `Menanam di slot ${slotIndex}...`);
            const plantResult = await api.plantSeed(slotIndex, bot.config.seedKey);

            if (plantResult.ok) {
                logger.success(`Slot ${slotIndex} ditanami ${bot.config.seedKey}.`);

                // Update timer tanam berdasarkan state terbaru tanpa memicu refresh global
                await sleep(500); // beri waktu server memperbarui state
                try {
                    const { state } = await api.getState();
                    const slot = state.plots.find(p => p.slotIndex === slotIndex);
                    if (slot?.seed) {
                        bot.setHarvestTimer(slotIndex, new Date(slot.seed.endsAt).getTime());
                    }
                } catch (e) {
                    logger.debug(`Gagal mengambil state setelah tanam slot ${slotIndex}: ${e.message}`);
                }
                if (bot.config.boosterKey) {
                    await handleBoosterApplication(bot, slotIndex);
                }
                return; // Sukses, keluar
            }

            if (plantResult.error?.message?.includes('Not enough')) {
                logger.warn(`Slot ${slotIndex} gagal tanam (race condition). Mencoba lagi...`);
                await sleep(1000); // Tunggu sebentar sebelum coba lagi
                continue; // Lanjutkan ke attempt berikutnya
            }
            throw new Error(plantResult.error?.message || 'Unknown planting error');
        } catch (error) {
            if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
            if (error instanceof SignatureError) return bot.handleSignatureError();
            logger.error(`Gagal menanam di slot ${slotIndex}: ${error.message}. Mencoba lagi... (${attempt}/3)`);
            if (attempt < 3) await sleep(5000);
            else logger.error(`Gagal total menanam di slot ${slotIndex} setelah 3 percobaan.`);
        }
    }
}

// [FIXED] Fungsi ini sekarang lebih tangguh terhadap race condition
export async function handleBoosterApplication(bot, slotIndex) {
    if (!bot.isRunning || !bot.config.boosterKey || bot.isPausedForCaptcha || bot.isPausedForSignature) return;

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await purchaseItemIfNeeded(bot, 'booster');

            // Cek ulang state sebelum memasang, jaga-jaga sudah dipasang proses lain
            const { state } = await api.getState();
            const currentSlot = state.plots.find(p => p.slotIndex === slotIndex);
            if (currentSlot && currentSlot.modifier) {
                logger.debug(`Booster untuk slot ${slotIndex} sudah dipasang oleh proses lain.`);
                bot.setBoosterTimer(slotIndex, new Date(currentSlot.modifier.endsAt).getTime()); return;
            }

            logger.action('boost', `Memasang booster di slot ${slotIndex}...`);
            const applyResult = await api.applyModifier(slotIndex, bot.config.boosterKey);

            if (applyResult.ok) {
                logger.success(`Booster ${bot.config.boosterKey} terpasang di slot ${slotIndex}.`);
                // Ambil state terbaru untuk menjadwalkan timer booster
                await sleep(500);
                try {
                    const { state } = await api.getState();
                    const slot = state.plots.find(p => p.slotIndex === slotIndex);
                    if (slot?.modifier) {
                        bot.setBoosterTimer(slotIndex, new Date(slot.modifier.endsAt).getTime());
                    }
                } catch (e) {
                    logger.debug(`Gagal mengambil state setelah pasang booster slot ${slotIndex}: ${e.message}`);
                } return; // Sukses, keluar
            }

            // Jika error karena booster habis (race condition), coba lagi dari awal
            if (applyResult.error?.message?.includes('Not enough')) {
                logger.warn(`Slot ${slotIndex} gagal pasang booster (race condition). Mencoba lagi...`);
                await sleep(1500); // Tunggu lebih lama agar pembelian selesai
                continue; // Lanjutkan ke attempt berikutnya
            }

            throw new Error(applyResult.error?.message || 'Unknown booster application error');
        } catch (error) {
            if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
            if (error instanceof SignatureError) return bot.handleSignatureError();
            logger.error(`Error saat memasang booster di slot ${slotIndex}: ${error.message}. Mencoba lagi... (${attempt}/3)`);
            if (attempt < 3) await sleep(5000);
            else logger.error(`Gagal total memasang booster di slot ${slotIndex} setelah 3 percobaan.`);
        }
    }
}

