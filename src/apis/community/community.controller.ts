import { Container } from 'typedi';
import { CommunityService } from './community.service';
import { Request, Response, Router } from 'express';
import { asyncHandler } from '../../middleware/async.handler';
import accessGuard from '../../middleware/auth.guard/access.guard';
import { idType, pathType } from '../../common/types';
// import { validateDTO } from '../../common/validator/validateDTO';
import { CreateCommunityDTO } from './dto/create.input';
import { FindOneCommunityDTO } from './dto/findOneCommunity';
import { FindManyCommunityDTO } from './dto/findManyCommunity';
import Validate from '../../common/validator/validateDTO';
import { next } from 'cheerio/lib/api/traversing';

class CommunityController {
    router = Router();
    path = '/community';

    constructor(
        private readonly communityService: CommunityService, //
    ) {
        this.init();
    }
    init() {
        this.router.post(
            '/create',
            Validate.createCommunity,
            accessGuard.handle,
            asyncHandler(this.create.bind(this)),
        );
        this.router.get(
            '/',
            Validate.findManyCommunity,
            asyncHandler(this.fidneMany.bind(this)),
        );
        this.router.get(
            '/:id',
            Validate.findOneCommunity,
            accessGuard.handle,
            asyncHandler(this.findeOne.bind(this)),
        );
    }

    async create(req: Request, res: Response) {
        const { id } = req.user as idType;
        const createCommunity = req.body;

        res.status(200).json({
            data: await this.communityService.create({
                id,
                createCommunity,
            }),
        });
    }

    async fidneMany(req: Request, res: Response) {
        const { path } = req.query as pathType;

        res.status(200).json({
            data: await this.communityService.findeMany({ path }),
        });
    }

    async findeOne(req: Request, res: Response) {
        const { id } = req.params as idType;

        res.status(200).json({
            data: await this.communityService.findOne({ id }),
        });
    }
}

export default new CommunityController(Container.get(CommunityService));
