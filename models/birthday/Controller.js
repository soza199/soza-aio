// controllers/birthdayController.js
const Birthday = require('./Schema');
const moment = require('moment-timezone');

class BirthdayController {
    
    /**
     * Set or update a user's birthday
     */
    async setBirthday(userId, guildId, birthdayString, timezone = 'Asia/Jakarta', options = {}) {
        try {
            // Parse birthday string (supports multiple formats)
            const birthday = this.parseBirthdayString(birthdayString);
            if (!birthday) {
                throw new Error('Invalid birthday. Please use a valid day and month, such as day 27 and month 9.');
            }

            const normalizedTimezone = this.normalizeTimezone(timezone);
            if (!normalizedTimezone) {
                throw new Error('Invalid timezone. Choose a supported timezone, such as Asia/Jakarta.');
            }

            const birthdayData = {
                userId,
                guildId,
                // Store the calendar date at UTC noon so it cannot roll back
                // or forward a day when the process runs in another timezone.
                birthday: new Date(Date.UTC(
                    birthday.year(),
                    birthday.month(),
                    birthday.date(),
                    12,
                    0,
                    0
                )),
                timezone: normalizedTimezone,
                ...options
            };

            // Calculate zodiac sign
            const tempBirthday = new Birthday(birthdayData);
            birthdayData.zodiacSign = tempBirthday.calculateZodiacSign();

            const result = await Birthday.findOneAndUpdate(
                { userId, guildId },
                birthdayData,
                { upsert: true, new: true }
            );

            return {
                success: true,
                birthday: result,
                message: `Birthday set successfully! 🎉`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    normalizeTimezone(timezone = 'Asia/Jakarta') {
        const aliases = {
            INDONESIA: 'Asia/Jakarta',
            WIB: 'Asia/Jakarta',
            WITA: 'Asia/Makassar',
            WIT: 'Asia/Jayapura'
        };
        const requestedTimezone = String(timezone).trim();
        const normalizedTimezone = aliases[requestedTimezone.toUpperCase()] || requestedTimezone;

        return moment.tz.zone(normalizedTimezone) ? normalizedTimezone : null;
    }

    /**
     * Get a user's birthday information
     */
    async getBirthday(userId, guildId) {
        try {
            const birthday = await Birthday.findOne({ userId, guildId });
            
            if (!birthday) {
                return {
                    success: false,
                    error: 'No birthday found for this user.'
                };
            }

            return {
                success: true,
                birthday,
                age: birthday.age,
                daysUntil: birthday.daysUntilBirthday,
                zodiacSign: birthday.zodiacSign
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Remove a user's birthday
     */
    async removeBirthday(userId, guildId) {
        try {
            const result = await Birthday.findOneAndDelete({ userId, guildId });
            
            if (!result) {
                return {
                    success: false,
                    error: 'No birthday found to remove.'
                };
            }

            return {
                success: true,
                message: 'Birthday removed successfully.'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get upcoming birthdays
     */
    async getUpcomingBirthdays(guildId, days = 30) {
        try {
            const upcomingBirthdays = await Birthday.getUpcoming(guildId, days);
            
            return {
                success: true,
                birthdays: upcomingBirthdays,
                count: upcomingBirthdays.length
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get today's birthdays
     */
    async getTodaysBirthdays(guildId) {
        try {
            const birthdays = await Birthday.find({ guildId });
            const now = new Date();
            const todaysBirthdays = birthdays.filter(birthday => {
                const timezone = this.normalizeTimezone(birthday.timezone) || 'UTC';
                const localNow = moment.tz(now, timezone);
                const birthdayDate = moment.utc(birthday.birthday);
                return birthdayDate.month() === localNow.month()
                    && birthdayDate.date() === localNow.date();
            });
            
            return {
                success: true,
                birthdays: todaysBirthdays,
                count: todaysBirthdays.length
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Find birthdays whose own timezone has just reached 00:00.
     * The handler calls this once per minute so each user's local midnight
     * is respected instead of relying on the server's timezone.
     */
    async getBirthdaysAtMidnight(guildId, now = new Date()) {
        try {
            const birthdays = await Birthday.find({ guildId });
            const matches = birthdays.filter(birthday => {
                const timezone = this.normalizeTimezone(birthday.timezone) || 'UTC';
                const localNow = moment.tz(now, timezone);
                const birthdayDate = moment.utc(birthday.birthday);

                if (localNow.hour() !== 0 || localNow.minute() !== 0) return false;
                if (birthdayDate.month() !== localNow.month() || birthdayDate.date() !== localNow.date()) {
                    return false;
                }

                const lastCelebrated = birthday.stats?.lastCelebrated
                    ? moment.tz(birthday.stats.lastCelebrated, timezone)
                    : null;

                return !lastCelebrated
                    || lastCelebrated.year() !== localNow.year()
                    || lastCelebrated.month() !== localNow.month()
                    || lastCelebrated.date() !== localNow.date();
            });

            return {
                success: true,
                birthdays: matches,
                count: matches.length
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Add a birthday wish
     */
    async addWish(userId, guildId, fromUserId, message, isAnonymous = false) {
        try {
            const birthday = await Birthday.findOne({ userId, guildId });
            
            if (!birthday) {
                return {
                    success: false,
                    error: 'User not found or birthday not set.'
                };
            }

            const wish = {
                fromUserId: isAnonymous ? null : fromUserId,
                message,
                timestamp: new Date(),
                isAnonymous
            };

            birthday.wishes.push(wish);
            birthday.stats.totalWishes += 1;
            
            await birthday.save();

            return {
                success: true,
                message: 'Birthday wish added successfully! 🎁',
                wishId: birthday.wishes[birthday.wishes.length - 1]._id
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update birthday settings
     */
    async updateSettings(userId, guildId, settings) {
        try {
            const birthday = await Birthday.findOneAndUpdate(
                { userId, guildId },
                { $set: { settings: { ...settings } } },
                { new: true }
            );

            if (!birthday) {
                return {
                    success: false,
                    error: 'Birthday not found.'
                };
            }

            return {
                success: true,
                birthday,
                message: 'Settings updated successfully!'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get birthday statistics for a guild
     */
    async getGuildStats(guildId) {
        try {
            const stats = await Birthday.aggregate([
                { $match: { guildId } },
                {
                    $group: {
                        _id: null,
                        totalBirthdays: { $sum: 1 },
                        totalWishes: { $sum: '$stats.totalWishes' },
                        totalCelebrations: { $sum: '$stats.celebrationsReceived' },
                        zodiacCounts: {
                            $push: '$zodiacSign'
                        }
                    }
                },
                {
                    $project: {
                        totalBirthdays: 1,
                        totalWishes: 1,
                        totalCelebrations: 1,
                        mostCommonZodiac: {
                            $arrayElemAt: [
                                {
                                    $map: {
                                        input: {
                                            $slice: [
                                                {
                                                    $sortByCount: {
                                                        $filter: {
                                                            input: '$zodiacCounts',
                                                            as: 'zodiac',
                                                            cond: { $ne: ['$$zodiac', null] }
                                                        }
                                                    }
                                                },
                                                1
                                            ]
                                        },
                                        as: 'item',
                                        in: '$$item._id'
                                    }
                                },
                                0
                            ]
                        }
                    }
                }
            ]);

            const thisMonth = await Birthday.countDocuments({
                guildId,
                $expr: {
                    $eq: [{ $month: '$birthday' }, new Date().getMonth() + 1]
                }
            });

            return {
                success: true,
                stats: {
                    ...stats[0],
                    birthdaysThisMonth: thisMonth
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Parse birthday string from various formats
     */
    parseBirthdayString(birthdayString) {
        const formats = [
            'MM-DD-YYYY',
            'MM/DD/YYYY',
            'DD-MM-YYYY',
            'DD/MM/YYYY',
            'YYYY-MM-DD',
            'MM-DD',
            'MM/DD',
            'DD-MM',
            'DD/MM'
        ];

        for (const format of formats) {
            const parsed = moment(birthdayString, format, true);
            if (parsed.isValid()) {
                // If year is not provided, use a default year (but it doesn't matter for birthday)
                if (format.length <= 5) {
                    parsed.year(2000); // Default year for birthdays without year
                }
                return parsed;
            }
        }

        return null;
    }

    /**
     * Get birthday leaderboard (most wishes received)
     */
    async getBirthdayLeaderboard(guildId, limit = 10) {
        try {
            const leaderboard = await Birthday.find({ guildId })
                .sort({ 'stats.totalWishes': -1 })
                .limit(limit)
                .select('userId stats birthday zodiacSign');

            return {
                success: true,
                leaderboard
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get birthdays by zodiac sign
     */
    async getBirthdaysByZodiac(guildId, zodiacSign) {
        try {
            const birthdays = await Birthday.find({ 
                guildId, 
                zodiacSign: zodiacSign.toLowerCase() 
            });

            return {
                success: true,
                birthdays,
                count: birthdays.length
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Celebrate a birthday (increment stats)
     */
    async celebrateBirthday(userId, guildId) {
        try {
            const birthday = await Birthday.findOneAndUpdate(
                { userId, guildId },
                {
                    $inc: { 'stats.celebrationsReceived': 1 },
                    $set: { 'stats.lastCelebrated': new Date() }
                },
                { new: true }
            );

            if (!birthday) {
                return {
                    success: false,
                    error: 'Birthday not found.'
                };
            }

            return {
                success: true,
                birthday,
                message: 'Birthday celebration recorded! 🎉'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new BirthdayController();